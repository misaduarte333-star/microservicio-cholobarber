import paramiko
import json

def inspect_container_env():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting to 192.168.1.13...")
        client.connect('192.168.1.13', username='dev', password='devadmin2026')
        print("Connected!\n")
        
        # Get container ID
        cmd_find = 'sudo -S docker ps -qf "name=microservicio_microservicio"'
        stdin, stdout, stderr = client.exec_command(cmd_find)
        stdin.write('devadmin2026\n')
        stdin.flush()
        container_id = stdout.read().decode().strip()
        print(f"Container ID: {container_id}")
        
        if container_id:
            # Let's inspect the container's environment variables
            print("--- Inspecting Container Environment ---")
            cmd_inspect = f'sudo -S docker inspect {container_id}'
            stdin, stdout, stderr = client.exec_command(cmd_inspect)
            stdin.write('devadmin2026\n')
            stdin.flush()
            
            inspect_out = stdout.read().decode()
            if inspect_out:
                data = json.loads(inspect_out)
                if data:
                    env = data[0]['Config']['Env']
                    print("\nEnvironment Variables:")
                    for e in env:
                        # Avoid printing keys fully but show names
                        parts = e.split('=', 1)
                        name = parts[0]
                        val = parts[1] if len(parts) > 1 else ''
                        masked_val = val[:8] + "..." + val[-8:] if len(val) > 16 else val
                        print(f"  {name} = {masked_val}")
        else:
            print("Could not find the microservicio container.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    inspect_container_env()
