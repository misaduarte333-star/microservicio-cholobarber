
const url = 'https://cholobot-evolution.ada8bf.easypanel.host/instance/logout/barberia';
const globalKey = '123456.+az1';

fetch(url, {
  method: 'DELETE',
  headers: {
    'apikey': globalKey
  }
})
.then(res => res.json())
.then(data => console.log('Logged out barberia:', data))
.catch(err => console.error('Error logging out barberia:', err));
