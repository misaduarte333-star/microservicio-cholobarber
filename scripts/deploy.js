const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("🚀 Iniciando proceso de despliegue automatizado...");

try {
  // 1. Verificar que compila sin errores TypeScript
  console.log("📦 Compilando TypeScript...");
  execSync('npm run build', { stdio: 'inherit' });
  console.log("✅ Build exitoso. No hay errores de TypeScript.");

  // 2. Pedir mensaje de commit
  rl.question('📝 Ingresa el mensaje de tu commit (o presiona enter para "Auto deploy"): ', (msg) => {
    const commitMsg = msg.trim() || "Auto deploy - Actualización de microservicio";

    try {
      console.log("➕ Agregando archivos a Git...");
      execSync('git add .', { stdio: 'inherit' });

      console.log(`💾 Creando commit: "${commitMsg}"...`);
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

      console.log("☁️ Subiendo cambios al repositorio remoto...");
      execSync('git push --set-upstream origin main', { stdio: 'inherit' });

      console.log("🎉 ¡Despliegue completado! Easypanel detectará el push y reiniciará el App.");
    } catch (gitError) {
      console.error("⚠️ Hubo un detalle con Git (probablemente no hay cambios nuevos para subir o no has configurado el 'git remote').");
    } finally {
      rl.close();
    }
  });

} catch (error) {
  console.error("❌ El build falló. Arregla los errores de TypeScript antes de desplegar.");
  rl.close();
  process.exit(1);
}
