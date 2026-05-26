import paramiko

def check_server():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting...")
        client.connect('192.168.1.7', username='dev', password='devadmin2026')
        print("Connected! Running 'sudo docker ps'...")
        
        # Run docker ps with sudo
        stdin, stdout, stderr = client.exec_command('sudo -S docker ps --format "{{.Names}} | {{.Ports}}"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out: print("Docker PS:\n" + out)
        if err: print("Docker Error:\n" + err)
        
        print("\nChecking for port 3006...")
        stdin, stdout, stderr = client.exec_command('sudo -S ss -tulnp | grep 3006')
        stdin.write('devadmin2026\n')
        stdin.flush()
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out: print("SS Output:\n" + out)
        else: print("No output from ss for port 3006.")
        if err: print("SS Error:\n" + err)

        print("\nChecking all listening ports for node or docker-proxy...")
        stdin, stdout, stderr = client.exec_command('sudo -S ss -tulnp | grep -E "node|docker|300"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        out = stdout.read().decode()
        if out: print("Listening Ports:\n" + out)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_server()
