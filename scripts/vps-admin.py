"""SSH operations with credentials supplied on stdin, never saved to disk."""
import json, sys, os, shlex
import paramiko

request = json.load(sys.stdin)
client = paramiko.SSHClient()
client.load_host_keys(os.path.expanduser('~/.ssh/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    client.connect(request['host'], username=request['user'], password=request['password'], timeout=20, look_for_keys=False, allow_agent=False)
    if request.get('uploads'):
        # Managed Cloudways SFTP can be jailed away from the SSH home directory.
        for item in request['uploads']:
            stdin, stdout, stderr = client.exec_command('umask 077; cat > ' + shlex.quote(item['remote']))
            with open(item['local'], 'rb') as source:
                while chunk := source.read(65536):
                    stdin.write(chunk)
            stdin.flush()
            stdin.channel.shutdown_write()
            if stdout.channel.recv_exit_status() != 0:
                raise RuntimeError('Upload failed: ' + stderr.read().decode(errors='replace'))
    for command in request.get('commands', []):
        secret_stdin = isinstance(command, dict) and command.get('password_stdin')
        if isinstance(command, dict):
            command = command['command']
        stdin, stdout, stderr = client.exec_command(command, timeout=120)
        if secret_stdin:
            stdin.write(request['password'] + '\n')
            stdin.flush()
            stdin.channel.shutdown_write()
        result = {'code': stdout.channel.recv_exit_status(), 'output': stdout.read().decode(errors='replace'), 'error': stderr.read().decode(errors='replace')}
        for key in ('output', 'error'):
            result[key] = result[key].replace(request['password'], '[redacted]')
        print(json.dumps(result), flush=True)
finally:
    client.close()
    request.clear()
