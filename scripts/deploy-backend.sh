#!/usr/bin/env bash
set -e

INSTANCE="ocid1.instance.oc1.phx.anyhqljrzdkr2wqcmrymvnmvh4dvesnbgvfzdispqpom6bgri4vxwiws6r2a"
VM_IP="129.146.52.142"

echo "=== hello-ai backend deploy ==="

echo "[1/4] Generating fresh key pair..."
KEY=/tmp/deploy_key
ssh-keygen -t rsa -b 2048 -f $KEY -N "" -q

echo "[2/4] Appending new SSH key to VM metadata..."
python3 -c "
import json, subprocess
oid = '$INSTANCE'
r = subprocess.run(['oci','compute','instance','get','--instance-id',oid,'--query','data.metadata.\"ssh_authorized_keys\"','--raw-output'],capture_output=True,text=True)
existing = r.stdout.strip()
with open('/tmp/deploy_key.pub') as f:
    new = f.read().strip()
combined = existing + '\n' + new if existing else new
meta = json.dumps({'ssh_authorized_keys': combined})
subprocess.run(['oci','compute','instance','update','--instance-id',oid,'--metadata',meta,'--force'],check=True)
print('SSH key added to VM')
"

echo "[3/4] Waiting for key propagation..."
sleep 5

echo "[4/4] Deploying backend..."
ssh -o StrictHostKeyChecking=no -i $KEY ubuntu@$VM_IP bash << 'REMOTE'
  set -e
  cd ~/hello-ai
  git pull origin main
  cd backend
  docker compose up --build -d
  docker image prune -f
  echo "Backend deployed!"
REMOTE

echo "=== Done ==="
