import paramiko

def test_container_networking():
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
            # Let's run a Node fetch test inside the container
            print("--- Executing Node fetch to Supabase inside container ---")
            node_code = "fetch('https://zzkryfmfoucxxmimrhyh.supabase.co/rest/v1/').then(res => console.log('STATUS:', res.status, 'HEADERS:', JSON.stringify([...res.headers]))).catch(err => console.error('ERROR:', err))"
            cmd_node = f'sudo -S docker exec {container_id} node -e "{node_code}"'
            stdin, stdout, stderr = client.exec_command(cmd_node)
            stdin.write('devadmin2026\n')
            stdin.flush()
            print("Stdout:", stdout.read().decode())
            print("Stderr:", stderr.read().decode())
        else:
            print("Could not find the microservicio container.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    test_container_networking()
