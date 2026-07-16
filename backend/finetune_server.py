"""Server-side LLM fine-tuning + inference.

Training uses PEFT LoRA via HuggingFace transformers. When CUDA is available
we optionally use Unsloth's FastLanguageModel for ~2x speed / lower VRAM; the
API surface is identical either way, so this is a thin conditional wrap.

Runs on CPU by default (Oracle always-free ARM VM has no GPU). Small models
only: TinyLlama-1.1B, SmolLM2-135M/1.7B.
"""
import io
import json
import logging
import os
import uuid

logger = logging.getLogger("finetune_server")

# Base models available in the UI. Apache-2.0 where possible.
BASE_MODELS = {
    "TinyLlama/TinyLlama-1.1B-Chat-v1.0": {
        "label": "TinyLlama 1.1B (Apache-2.0)",
        "max_seq_len": 1024,
    },
    "HuggingFaceTB/SmolLM2-1.7B-Instruct": {
        "label": "SmolLM2 1.7B (Apache-2.0)",
        "max_seq_len": 2048,
    },
    "HuggingFaceTB/SmolLM2-135M-Instruct": {
        "label": "SmolLM2 135M (Apache-2.0)",
        "max_seq_len": 2048,
    },
}


def list_base_models():
    return [{"id": k, **v} for k, v in BASE_MODELS.items()]


def build_prompt(instruction: str, input_text: str = "", response: str = "") -> str:
    """Format an instruction/input/response triple for chat tuning."""
    if input_text:
        p = f"### Instruction:\n{instruction}\n\n### Input:\n{input_text}\n"
    else:
        p = f"### Instruction:\n{instruction}\n"
    if response:
        p += f"\n### Response:\n{response}"
    return p


def load_dataset_jsonl(text: str):
    """Parse JSONL text into a list of records with instruction/input/output."""
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            raise ValueError(f"invalid JSONL: {e}")
        # Accept common field names.
        instr = obj.get("instruction") or obj.get("prompt") or obj.get("input") or ""
        inp = obj.get("input") or obj.get("context") or ""
        out = obj.get("output") or obj.get("response") or obj.get("completion") or ""
        if not instr or not out:
            raise ValueError("each row needs instruction/prompt and output/response")
        rows.append({"instruction": instr, "input": inp, "output": out})
    if not rows:
        raise ValueError("dataset is empty")
    return rows


def train_lora(
    base_model: str,
    dataset_rows: list,
    params: dict,
    adapter_dir: str,
    log_fn,
) -> None:
    """Fine-tune `base_model` with LoRA on `dataset_rows`; save adapter to disk.

    `log_fn(message)` is called with progress lines (captured into jobs.loss_log).
    """
    import torch
    from transformers import (
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
    )
    from peft import LoraConfig, get_peft_model
    from datasets import Dataset

    if base_model not in BASE_MODELS:
        raise ValueError(f"unknown base model: {base_model}")

    max_seq_len = int(params.get("max_seq_len", BASE_MODELS[base_model]["max_seq_len"]))
    r = int(params.get("lora_r", 16))
    lora_alpha = int(params.get("lora_alpha", 32))
    epochs = float(params.get("epochs", 3))
    lr = float(params.get("learning_rate", 2e-4))
    batch_size = int(params.get("batch_size", 4))

    use_unsloth = torch.cuda.is_available()
    if use_unsloth:
        try:
            from unsloth import FastLanguageModel
        except ImportError:
            use_unsloth = False

    log_fn(f"loading {base_model} (unsloth={use_unsloth})")
    if use_unsloth:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=base_model,
            max_seq_length=max_seq_len,
            dtype=torch.float16,
            load_in_4bit=True,
        )
        model = FastLanguageModel.get_peft_model(
            model,
            r=r,
            lora_alpha=lora_alpha,
            target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            lora_dropout=0,
            bias="none",
            use_gradient_checkpointing="unsloth",
        )
    else:
        from transformers import AutoModelForCausalLM, AutoTokenizer

        dtype = torch.float32
        tokenizer = AutoTokenizer.from_pretrained(base_model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(
            base_model, torch_dtype=dtype
        )
        lora_config = LoraConfig(
            r=r,
            lora_alpha=lora_alpha,
            target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            lora_dropout=0.0,
            bias="none",
            task_type="CAUSAL_LM",
        )
        model = get_peft_model(model, lora_config)

    # Tokenize dataset.
    def tokenize(example):
        text = build_prompt(
            example["instruction"], example["input"], example["output"]
        )
        tok = tokenizer(
            text, truncation=True, padding="max_length", max_length=max_seq_len
        )
        tok["labels"] = tok["input_ids"].copy()
        return tok

    ds = Dataset.from_list(dataset_rows).map(tokenize, batched=False)
    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    training_args = TrainingArguments(
        output_dir=adapter_dir,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=max(1, 4 // batch_size),
        num_train_epochs=epochs,
        learning_rate=lr,
        logging_steps=1,
        save_strategy="no",
        report_to="none",
        fp16=False,
        bf16=False,
        optim="adamw_torch",
        max_grad_norm=0.3,
        warmup_ratio=0.03,
        lr_scheduler_type="constant",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=ds,
        data_collator=data_collator,
    )

    log_fn(f"training on {len(ds)} examples, {epochs} epochs")
    result = trainer.train()
    log_fn(f"train loss: {result.metrics.get('train_loss'):.4f}")

    os.makedirs(adapter_dir, exist_ok=True)
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    log_fn(f"saved adapter -> {adapter_dir}")


def generate(
    base_model: str,
    adapter_path: str | None,
    prompt: str,
    max_new_tokens: int = 128,
    temperature: float = 0.7,
) -> str:
    """Generate text from `base_model`, optionally with a LoRA `adapter_path`."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

    tokenizer = AutoTokenizer.from_pretrained(base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(base_model, torch_dtype=torch.float32)
    if adapter_path and os.path.isdir(adapter_path):
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, adapter_path)

    gen = pipeline(
        "text-generation",
        model=model,
        tokenizer=tokenizer,
        torch_dtype=torch.float32,
        device=-1,  # CPU
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        do_sample=temperature > 0,
        pad_token_id=tokenizer.pad_token_id,
    )
    out = gen(prompt, return_full_text=False)
    return out[0]["generated_text"].strip()
