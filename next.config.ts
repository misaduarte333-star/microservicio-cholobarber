/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    experimental: {
        cpus: 1,
        workerThreads: false,
        memoryBasedWorkersCount: true,
    }
}

export default nextConfig
