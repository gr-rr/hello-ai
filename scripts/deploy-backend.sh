#!/usr/bin/env bash
set -e

INSTANCE_ID="ocid1.instance.oc1.phx.anyhqljrzdkr2wqcmrymvnmvh4dvesnbgvfzdispqpom6bgri4vxwiws6r2a"
VM_IP="129.146.52.142"
VM_USER="ubuntu"

echo "=== hello-ai backend deploy ==="

echo "1/4: Generating SSH key pair..."
ssh-keygen -t rsa -f ~/.ssh/deploy_key -N "" -q

echo "2/4: Adding SSH key to VM metadata..."
PUBKEY=$(cat ~/.ssh/deploy_key.pub)
oci compute instance update --instance-id "$INSTANCE_ID" \
  --metadata "{\"ssh_authorized_keys\":\"$PUBKEY\"}" \
  --force > /dev/null 2>&1

echo "3/4: Waiting for VM to accept key..."
sleep 5

echo "4/4: Deploying backend..."
ssh -o StrictHostKeyChecking=no -i ~/.ssh/deploy_key "$VM_USER@$VM_IP" bash << 'REMOTE'
  set -e
  cd ~/hello-ai
  git pull origin main
  cd backend
  docker compose up --build -d
  docker image prune -f
  echo "Backend deployed successfully!"
REMOTE

echo "=== Done ==="
