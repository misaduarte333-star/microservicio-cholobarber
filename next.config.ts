/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    experimental: {
        // Limita a 1 CPU para evitar picos masivos de RAM durante "Generating static pages"
        cpus: 1,
        workerThreads: false,
        memoryBasedWorkersCount: true,
    }
}

export default nextConfig
