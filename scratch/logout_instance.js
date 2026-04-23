
const url = 'https://cholobot-evolution.ada8bf.easypanel.host/instance/logout/cholobarber';
const globalKey = '123456.+az1';

fetch(url, {
  method: 'DELETE',
  headers: {
    'apikey': globalKey
  }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error('Error fetching:', err));
