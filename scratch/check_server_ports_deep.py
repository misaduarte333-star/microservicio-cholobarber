import paramiko
import json

def check_server():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting...")
        client.connect('192.168.1.7', username='dev', password='devadmin2026')
        print("Connected!\n")
        
        # 1. Check all Docker containers (including stopped)
        print("--- Docker PS (All) ---")
        stdin, stdout, stderr = client.exec_command('sudo -S docker ps -a --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        print(stdout.read().decode())
        
        # 2. Check explicitly for ANY process listening on 3006
        print("\n--- Checking SS for port 3006 ---")
        stdin, stdout, stderr = client.exec_command('sudo -S ss -tulnp | grep 3006')
        stdin.write('devadmin2026\n')
        stdin.flush()
        ss_out = stdout.read().decode()
        if ss_out:
            print("FOUND something on 3006:\n", ss_out)
        else:
            print("NOTHING listening on port 3006 directly on the host.")

        # 3. Inspect the microservicio container to see its internal environment/ports
        print("\n--- Inspecting microservicio_microservicio for '3006' ---")
        stdin, stdout, stderr = client.exec_command('sudo -S docker inspect $(sudo -S docker ps -aqf "name=microservicio_microservicio")')
        stdin.write('devadmin2026\n')
        stdin.flush()
        inspect_out = stdout.read().decode()
        if inspect_out:
            try:
                data = json.loads(inspect_out)
                if data:
                    env = data[0]['Config']['Env']
                    ports = data[0]['NetworkSettings']['Ports']
                    print("Exposed Ports in Container:", ports)
                    
                    found_3006 = False
                    for e in env:
                        if '3006' in e:
                            print("Found 3006 in Env:", e)
                            found_3006 = True
                    if not found_3006:
                        print("Port 3006 NOT found in container environment variables.")
            except Exception as e:
                print("Could not parse inspect JSON or container not found.", e)
        
        # 4. Check easypanel configuration for cholobot
        print("\n--- Grep 3006 in Easypanel config/docker-compose files ---")
        stdin, stdout, stderr = client.exec_command('sudo -S grep -R 3006 /etc/easypanel /opt/easypanel /ROOT 2>/dev/null')
        stdin.write('devadmin2026\n')
        stdin.flush()
        grep_out = stdout.read().decode()
        if grep_out:
            print("Found 3006 in server files:\n", grep_out)
        else:
            print("Port 3006 NOT found in Easypanel/Docker config files.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_server()
