import * as dotenv from 'dotenv'

dotenv.config()

const evoUrl = 'https://cholobot-evolution.ada8bf.easypanel.host'
const apikey = '123456.+az1'
const instance = 'Cholobarber'

async function checkEvolution() {
    console.log(`--- REVISANDO INSTANCIA: ${instance} ---`)
    const headers = { apikey }

    try {
        // 1. Estado de conexión
        const resConn = await fetch(`${evoUrl}/instance/connectionState/${instance}`, { headers })
        const dataConn = await resConn.json()
        console.log('\n1. Estado de Conexión:', JSON.stringify(dataConn, null, 2))

        // 2. Webhooks configurados
        const resWh = await fetch(`${evoUrl}/webhook/find/${instance}`, { headers })
        const dataWh = await resWh.json()
        console.log('\n2. Webhooks Configurados:', JSON.stringify(dataWh, null, 2))

        // 3. Info de la instancia
        const resInfo = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instance}`, { headers })
        const dataInfo = await resInfo.json()
        console.log('\n3. Info General:', JSON.stringify(dataInfo, null, 2))

    } catch (error: any) {
        console.error('Error al conectar con Evolution:', error.message)
    }
}

checkEvolution()
