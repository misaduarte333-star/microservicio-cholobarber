import paramiko

def check_cloudflare():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting...")
        client.connect('192.168.1.7', username='dev', password='devadmin2026')
        
        # Get networks for cloudflared
        stdin, stdout, stderr = client.exec_command('sudo -S docker inspect $(sudo -S docker ps -aqf "name=cloudflared") --format "{{json .NetworkSettings.Networks}}"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        cf_net = stdout.read().decode()
        print("Cloudflared networks:", cf_net)

        # Get networks and aliases for microservice
        stdin, stdout, stderr = client.exec_command('sudo -S docker inspect $(sudo -S docker ps -aqf "name=microservicio_microservicio") --format "{{json .NetworkSettings.Networks}}"')
        stdin.write('devadmin2026\n')
        stdin.flush()
        ms_net = stdout.read().decode()
        print("\nMicroservice networks:", ms_net)
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    check_cloudflare()
