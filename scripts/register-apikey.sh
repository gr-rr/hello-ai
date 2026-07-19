#!/usr/bin/env bash
set -e
echo "=== Registering API key for remote CLI access ==="
cat > /tmp/api_key.pub << 'KEYEOF'
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmHYGZMuoDKKoL5bk1zzg
x4Z6NqbeFa8DzY4d+yuQ4n5sY5C9J9GDAUrwE/QTrbJ4b2a8bAFiW9EZa0/eje/O
SIGleQLmCL5dy/P+CGgWFxCIhPJ0haJ4lqc8kZNbRtlWaszBhU4GVkDxStPyeCbQ
PXXtt3kNgJlrN2f3IjZ2nXMXNOEIb0LnCaFFQuBYVQAtCCzyC0Gcwckrf1tPoQkm
fqlFVjIQgbwbXgqRigYM/wCHfu3Psbyb2AT7GQIs0L8VBgs4/0OfWL/2ZbujuYK4
y+HdiOmDZjrxe35JYJarPZg6+a0P38dJaOQ3s0MdRTRu0xXZU7VE9A/axheTOEwC
EwIDAQAB
-----END PUBLIC KEY-----
KEYEOF
oci iam user api-key upload --user-id ocid1.user.oc1..aaaaaaaal3dbmlhc7ox6bagjbgo2gl2f3rs647alulneo2ldpcovnrujxokq --key-file /tmp/api_key.pub
echo "=== API key registered! I can now access OCI from here ==="
