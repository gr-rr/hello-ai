# FastAPI music backend. Builds for linux/arm64 (Oracle Ampere A1).
FROM python:3.11-slim

WORKDIR /app

# System libs needed by soundfile (libsndfile), audio ML deps, and FluidSynth.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ffmpeg fluidsynth \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bundle a GM SoundFont (FluidR3_GM, CC-BY 4.0 via Musical Artifacts) for
# natural MIDI rendering. File is copied from ./soundfonts at build time.
RUN mkdir -p /app/soundfonts
COPY soundfonts/FluidR3_GM.sf2 /app/soundfonts/FluidR3_GM.sf2

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
