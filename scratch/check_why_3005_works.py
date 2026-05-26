import paramiko

def check_host():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect('192.168.1.7', username='dev', password='devadmin2026')
        
        # Check cloudflared service
        print("--- Cloudflared Process ---")
        stdin, stdout, stderr = client.exec_command('sudo -S ps aux | grep cloudflared')
        stdin.write('devadmin2026\n')
        stdin.flush()
        print(stdout.read().decode())
        
        # Check docker ports exposed for cholobarber and microservice
        print("\n--- Docker Ports for Cholobarber ---")
        stdin, stdout, stderr = client.exec_command('sudo -S docker service ls | grep -E "cholobarber|microservicio"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        print(stdout.read().decode())

        print("\n--- EasyPanel Ports configuration ---")
        # Find which container exposes 3005
        stdin, stdout, stderr = client.exec_command('sudo -S docker ps --format "{{.Names}}\t{{.Ports}}"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        print(stdout.read().decode())

    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_host()
