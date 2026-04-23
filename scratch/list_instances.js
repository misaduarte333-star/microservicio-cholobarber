
const url = 'https://cholobot-evolution.ada8bf.easypanel.host/instance/fetchInstances';
const globalKey = '123456.+az1';

fetch(url, {
  method: 'GET',
  headers: {
    'apikey': globalKey
  }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error('Error fetching instances:', err));
