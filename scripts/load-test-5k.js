/**
 * Script de Teste de Carga para 5K Usuários Simultâneos
 * 
 * Este script simula 5.000 usuários simultâneos realizando operações típicas:
 * - Login de estudantes
 * - Acesso a testes
 * - Submissão de respostas
 * - Consulta de resultados
 * 
 * Uso: node scripts/load-test-5k.js
 * 
 * Pré-requisitos:
 * - npm install artillery -g
 * - Servidor rodando em localhost:3001
 */

const fs = require('fs');
const path = require('path');

// Configuração do teste Artillery
const artilleryConfig = {
  config: {
    target: 'http://localhost:3001',
    phases: [
      {
        name: 'Warm up',
        duration: 60,
        arrivalRate: 10,
        rampTo: 100
      },
      {
        name: 'Ramp up to 1K',
        duration: 120,
        arrivalRate: 100,
        rampTo: 1000
      },
      {
        name: 'Ramp up to 3K',
        duration: 180,
        arrivalRate: 1000,
        rampTo: 3000
      },
      {
        name: 'Peak load 5K',
        duration: 300,
        arrivalRate: 5000
      },
      {
        name: 'Cool down',
        duration: 60,
        arrivalRate: 5000,
        rampTo: 100
      }
    ],
    defaults: {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LoadTest-5K/1.0'
      }
    },
    variables: {
      // Dados de teste
      testSchoolId: '550e8400-e29b-41d4-a716-446655440000',
      testUserId: '550e8400-e29b-41d4-a716-446655440001',
      testId: '550e8400-e29b-41d4-a716-446655440002'
    }
  },
  scenarios: [
    {
      name: 'Student Login Flow',
      weight: 40,
      flow: [
        {
          post: {
            url: '/api/auth/student/login',
            json: {
              studentId: '{{ $randomString() }}',
              schoolId: '{{ testSchoolId }}'
            },
            capture: {
              json: '$.token',
              as: 'authToken'
            }
          }
        },
        {
          think: 2
        },
        {
          get: {
            url: '/api/tests/available',
            headers: {
              'Authorization': 'Bearer {{ authToken }}'
            }
          }
        }
      ]
    },
    {
      name: 'Test Access Flow',
      weight: 30,
      flow: [
        {
          post: {
            url: '/api/auth/student/login',
            json: {
              studentId: '{{ $randomString() }}',
              schoolId: '{{ testSchoolId }}'
            },
            capture: {
              json: '$.token',
              as: 'authToken'
            }
          }
        },
        {
          think: 1
        },
        {
          get: {
            url: '/api/tests/{{ testId }}',
            headers: {
              'Authorization': 'Bearer {{ authToken }}'
            }
          }
        },
        {
          think: 5
        },
        {
          post: {
            url: '/api/tests/{{ testId }}/start',
            headers: {
              'Authorization': 'Bearer {{ authToken }}'
            }
          }
        }
      ]
    },
    {
      name: 'Answer Submission Flow',
      weight: 25,
      flow: [
        {
          post: {
            url: '/api/auth/student/login',
            json: {
              studentId: '{{ $randomString() }}',
              schoolId: '{{ testSchoolId }}'
            },
            capture: {
              json: '$.token',
              as: 'authToken'
            }
          }
        },
        {
          think: 3
        },
        {
          post: {
            url: '/api/tests/{{ testId }}/answers',
            headers: {
              'Authorization': 'Bearer {{ authToken }}'
            },
            json: {
              questionId: '{{ $randomString() }}',
              answer: '{{ $randomInt(1, 4) }}',
              timeSpent: '{{ $randomInt(10, 120) }}'
            }
          }
        }
      ]
    },
    {
      name: 'Health Check Flow',
      weight: 5,
      flow: [
        {
          get: {
            url: '/health'
          }
        },
        {
          think: 1
        },
        {
          get: {
            url: '/metrics'
          }
        }
      ]
    }
  ]
};

// Salva a configuração em um arquivo YAML
const yamlContent = `
config:
  target: ${artilleryConfig.config.target}
  phases:
${artilleryConfig.config.phases.map(phase => `    - name: "${phase.name}"
      duration: ${phase.duration}
      arrivalRate: ${phase.arrivalRate}${phase.rampTo ? `
      rampTo: ${phase.rampTo}` : ''}`).join('\n')}
  defaults:
    headers:
      Content-Type: "application/json"
      User-Agent: "LoadTest-5K/1.0"
  variables:
    testSchoolId: "550e8400-e29b-41d4-a716-446655440000"
    testUserId: "550e8400-e29b-41d4-a716-446655440001"
    testId: "550e8400-e29b-41d4-a716-446655440002"

scenarios:
${artilleryConfig.scenarios.map(scenario => `  - name: "${scenario.name}"
    weight: ${scenario.weight}
    flow:
${scenario.flow.map(step => {
  if (step.post) {
    return `      - post:
          url: "${step.post.url}"
          json:
${Object.entries(step.post.json).map(([key, value]) => `            ${key}: "${value}"`).join('\n')}${step.post.capture ? `
          capture:
            json: "${step.post.capture.json}"
            as: "${step.post.capture.as}"` : ''}`;
  }
  if (step.get) {
    return `      - get:
          url: "${step.get.url}"${step.get.headers ? `
          headers:
${Object.entries(step.get.headers).map(([key, value]) => `            ${key}: "${value}"`).join('\n')}` : ''}`;
  }
  if (step.think) {
    return `      - think: ${step.think}`;
  }
  return '';
}).join('\n')}`).join('\n')}
`;

// Salva o arquivo de configuração
const configPath = path.join(__dirname, 'artillery-5k-test.yml');
fs.writeFileSync(configPath, yamlContent);

console.log('✅ Arquivo de configuração Artillery criado:', configPath);
console.log('\n🚀 Para executar o teste de carga:');
console.log('1. Instale o Artillery: npm install -g artillery');
console.log('2. Inicie o servidor: npm run dev');
console.log('3. Execute o teste: artillery run', configPath);
console.log('\n📊 O teste simulará:');
console.log('- Warm up: 10-100 usuários por 1 minuto');
console.log('- Ramp up: 100-1K usuários por 2 minutos');
console.log('- Ramp up: 1K-3K usuários por 3 minutos');
console.log('- Peak load: 5K usuários por 5 minutos');
console.log('- Cool down: 5K-100 usuários por 1 minuto');
console.log('\n⚠️  ATENÇÃO: Este teste gerará alta carga no sistema!');
console.log('   Execute apenas em ambiente de desenvolvimento/teste.');