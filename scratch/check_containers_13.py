import paramiko

def check_docker_containers():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting to 192.168.1.13...")
        client.connect('192.168.1.13', username='dev', password='devadmin2026')
        print("Connected!\n")
        
        # Check all Docker containers
        print("--- Docker PS (All) ---")
        stdin, stdout, stderr = client.exec_command('sudo -S docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        print(stdout.read().decode())
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_docker_containers()
