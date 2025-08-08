#!/bin/bash

# Script de build para Render
echo "🚀 Iniciando build para Render..."

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Gerar Prisma Client
echo "🔧 Gerando Prisma Client..."
npx prisma generate

# Build da aplicação
echo "🏗️ Compilando TypeScript..."
npm run build

echo "✅ Build concluído com sucesso!"