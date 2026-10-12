"""Create a deployment key and return only its public and sealed private forms."""
import base64, io, json, sys
import paramiko
from nacl.public import PublicKey, SealedBox

request = json.load(sys.stdin)
key = paramiko.RSAKey.generate(bits=3072)
stream = io.StringIO()
key.write_private_key(stream)
sealed = SealedBox(PublicKey(base64.b64decode(request['github_public_key']))).encrypt(stream.getvalue().encode())
print(json.dumps({'public_key': key.get_name() + ' ' + key.get_base64() + ' rushroom-actions', 'encrypted_private_key': base64.b64encode(sealed).decode()}))
stream.close()
