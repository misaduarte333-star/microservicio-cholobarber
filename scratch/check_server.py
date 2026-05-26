import paramiko
import json

def check_server(host, user, password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(host, username=user, password=password, timeout=10)
        
        def run_sudo(cmd):
            stdin, stdout, stderr = client.exec_command(f"echo {password} | sudo -S {cmd}")
            return stdout.read().decode(), stderr.read().decode()

        print("\n--- Traefik Service Inspection ---")
        out, err = run_sudo("docker service inspect easypanel-traefik")
        print(out)

        client.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_server("192.168.1.6", "dev", "devadmin2026")
