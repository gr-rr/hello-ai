#!/usr/bin/env bash
set -e

INSTANCE="ocid1.instance.oc1.phx.anyhqljrzdkr2wqcmrymvnmvh4dvesnbgvfzdispqpom6bgri4vxwiws6r2a"
VM_IP="129.146.52.142"

echo "=== hello-ai backend deploy ==="

echo "[1/5] Generating fresh key pair..."
KEY=/tmp/deploy_key
ssh-keygen -t rsa -b 2048 -f $KEY -N "" -q

echo "[2/5] Reading existing authorized keys from VM metadata..."
oci compute instance get --instance-id $INSTANCE --query 'data.metadata."ssh_authorized_keys"' --raw-output > /tmp/existing_keys.txt 2>/dev/null || true

echo "[3/5] Building combined keys JSON..."
echo -n '{"ssh_authorized_keys": "' > /tmp/metadata.json
cat /tmp/existing_keys.txt | sed 's/"/\\"/g' | tr -d '\n' >> /tmp/metadata.json
echo -n '\n' >> /tmp/metadata.json
cat /tmp/deploy_key.pub | sed 's/"/\\"/g' | tr -d '\n' >> /tmp/metadata.json
echo '"}' >> /tmp/metadata.json

echo "[4/5] Updating VM metadata..."
oci compute instance update --instance-id $INSTANCE --metadata file:///tmp/metadata.json --force

echo "[5/5] Deploying backend..."
sleep 3
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
