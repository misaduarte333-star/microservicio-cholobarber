
const url = 'https://cholobot-evolution.ada8bf.easypanel.host/instance/delete/barberia';
const globalKey = '123456.+az1';

fetch(url, {
  method: 'DELETE',
  headers: {
    'apikey': globalKey
  }
})
.then(res => res.json())
.then(data => console.log('Deleted barberia:', JSON.stringify(data, null, 2)))
.catch(err => console.error('Error deleting barberia:', err));
