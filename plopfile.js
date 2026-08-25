module.exports = function (plop) {
  // Helper personnalisé pour vérifier si un tableau contient une valeur
plop.setHelper('includes', function(array, value, options) {
  if (!options || typeof options.fn !== 'function') {
    return Array.isArray(array) && array.includes(value);
  }
  
  if (Array.isArray(array) && array.includes(value)) {
    return options.fn(this);
  }
  return options.inverse(this);
});

  // Générateur de module
  plop.setGenerator('module', {
    description: 'Générer un nouveau module complet',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Nom du module:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description du module:',
        default: 'Module généré automatiquement'
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Fonctionnalités à inclure:',
        choices: [
          { name: 'API REST', value: 'rest', checked: true },
          { name: 'Événements Kafka', value: 'events' },
          { name: 'Modèle de données', value: 'model', checked: true },
          { name: 'Tests', value: 'tests' }
        ]
      }
    ],
    actions: function(data) {
      const actions = [];
      
      // Créer le dossier du module (sans inclure index.hbs et event.ts)
      actions.push({
        type: 'addMany',
        destination: 'src/modules/{{kebabCase name}}',
        templateFiles: [
          'templates/module/**/*', 
          '!templates/module/index.hbs',
          '!templates/module/{{kebabCase name}}.event.ts.hbs'
        ],
        base: 'templates/module',
        abortOnFail: true,
        data: {
          description: data.description || 'Module généré automatiquement'
        }
      });
      
      // Ajouter explicitement le fichier index.ts
      actions.push({
        type: 'add',
        path: 'src/modules/{{kebabCase name}}/index.ts',
        templateFile: 'templates/module/index.hbs'
      });
      
      // Ajouter le module à l'index des modules
      actions.push({
        type: 'append',
        path: 'src/modules/index.ts',
        pattern: '// MODULE_EXPORTS',
        template: 'export * from \'./{{kebabCase name}}\';'
      });
      
      // Ajouter les routes si nécessaire
      if (data.features.includes('rest')) {
        actions.push({
          type: 'add',
          path: 'src/api/routes/{{kebabCase name}}.route.ts',
          templateFile: 'templates/route.hbs',
          data: {
            description: data.description || 'Module généré automatiquement'
          }
        });
      }
      
      // Ajouter le fichier event si nécessaire
      if (data.features.includes('events')) {
        actions.push({
          type: 'add',
          path: 'src/modules/{{kebabCase name}}/{{kebabCase name}}.event.ts',
          templateFile: 'templates/event.hbs',
          data: {
            description: data.description || 'Module généré automatiquement',
            eventTypes: ['created', 'updated', 'deleted'],
            name: data.name
          }
        });
      }
      
      // Générer les tests si nécessaire
      if (data.features.includes('tests')) {
        actions.push({
          type: 'add',
          path: 'src/tests/modules/{{kebabCase name}}/{{kebabCase name}}.test.ts',
          templateFile: 'templates/test.hbs',
          data: {
            description: data.description || 'Module généré automatiquement'
          }
        });
      }
      
      return actions;
    }
  });
  
  // Générateur de contrôleur
  plop.setGenerator('controller', {
    description: 'Générer un nouveau contrôleur',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nom du contrôleur:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du contrôleur est requis';
        }
      }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/modules/{{kebabCase module}}/{{kebabCase name}}.controller.ts',
        templateFile: 'templates/controller.hbs'
      },
      {
        type: 'append',
        path: 'src/modules/{{kebabCase module}}/index.ts',
        pattern: /$/,
        template: 'export * from \'./{{kebabCase name}}.controller\';'
      }
    ]
  });
  
  // Générateur de service
  plop.setGenerator('service', {
    description: 'Générer un nouveau service',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nom du service:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du service est requis';
        }
      }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/modules/{{kebabCase module}}/{{kebabCase name}}.service.ts',
        templateFile: 'templates/service.hbs'
      },
      {
        type: 'append',
        path: 'src/modules/{{kebabCase module}}/index.ts',
        pattern: /$/,
        template: 'export * from \'./{{kebabCase name}}.service\';'
      }
    ]
  });
  
  // Générateur de modèle
  plop.setGenerator('model', {
    description: 'Générer un nouveau modèle',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nom du modèle:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du modèle est requis';
        }
      },
      {
        type: 'checkbox',
        name: 'fields',
        message: 'Champs à inclure:',
        choices: [
          { name: 'Nom (String)', value: 'name', checked: true },
          { name: 'Description (String)', value: 'description', checked: true },
          { name: 'Statut (Enum)', value: 'status', checked: true },
          { name: 'Date de création (Date)', value: 'createdAt', checked: true },
          { name: 'Date de mise à jour (Date)', value: 'updatedAt', checked: true }
        ]
      }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/modules/{{kebabCase module}}/{{kebabCase name}}.model.ts',
        templateFile: 'templates/model.hbs'
      },
      {
        type: 'append',
        path: 'src/modules/{{kebabCase module}}/index.ts',
        pattern: /$/,
        template: 'export * from \'./{{kebabCase name}}.model\';'
      }
    ]
  });
  
  // Générateur de route
  plop.setGenerator('route', {
    description: 'Générer une nouvelle route',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nom de la route:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom de la route est requis';
        }
      },
      {
        type: 'checkbox',
        name: 'methods',
        message: 'Méthodes HTTP à inclure:',
        choices: [
          { name: 'GET', value: 'get', checked: true },
          { name: 'POST', value: 'post', checked: true },
          { name: 'PUT', value: 'put', checked: true },
          { name: 'DELETE', value: 'delete', checked: true }
        ]
      }
    ],
    actions: function(data) {
      const actions = [];
      
      actions.push({
        type: 'add',
        path: 'src/api/routes/{{kebabCase name}}.route.ts',
        templateFile: 'templates/route.hbs',
        data: {
          methods: data.methods,
          module: data.module
        }
      });
      
      // Ajouter les routes au router principal
      actions.push({
        type: 'append',
        path: 'src/router.ts',
        pattern: '// ROUTE_IMPORTS',
        template: 'import { {{pascalCase name}}Routes } from \'./api/routes/{{kebabCase name}}.route\';'
      });
      
      actions.push({
        type: 'append',
        path: 'src/router.ts',
        pattern: '// ROUTE_REGISTRATIONS',
        template: 'this.router.register({{pascalCase name}}Routes, { prefix });'
      });
      
      return actions;
    }
  });
  
  // Générateur d'événements
  plop.setGenerator('event', {
    description: 'Générer un gestionnaire d\'événements',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'checkbox',
        name: 'eventTypes',
        message: 'Types d\'événements à inclure:',
        choices: [
          { name: 'Création', value: 'created', checked: true },
          { name: 'Mise à jour', value: 'updated', checked: true },
          { name: 'Suppression', value: 'deleted', checked: true }
        ]
      }
    ],
    actions: function(data) {
      return [
        {
          type: 'add',
          path: 'src/modules/{{kebabCase module}}/{{kebabCase module}}.event.ts',
          templateFile: 'templates/event.hbs',
          data: { 
            eventTypes: data.eventTypes,
            name: data.module
          }
        },
        {
          type: 'append',
          path: 'src/modules/{{kebabCase module}}/index.ts',
          pattern: /$/,
          template: 'export * from \'./{{kebabCase module}}.event\';'
        }
      ];
    }
  });
  
  // Générateur d'interface
  plop.setGenerator('interface', {
    description: 'Générer une nouvelle interface',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nom de l\'interface:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom de l\'interface est requis';
        }
      },
      {
        type: 'checkbox',
        name: 'properties',
        message: 'Propriétés à inclure:',
        choices: [
          { name: '_id (string, optional)', value: 'id', checked: true },
          { name: 'name (string)', value: 'name', checked: true },
          { name: 'description (string, optional)', value: 'description', checked: true },
          { name: 'status (string, optional)', value: 'status', checked: true },
          { name: 'createdAt (Date, optional)', value: 'createdAt', checked: true },
          { name: 'updatedAt (Date, optional)', value: 'updatedAt', checked: true }
        ]
      }
    ],
    actions: [
      {
        type: 'add',
        path: 'src/modules/{{kebabCase module}}/{{kebabCase name}}.interface.ts',
        templateFile: 'templates/interface.hbs',
        data: function(data) {
          return { properties: data.properties };
        }
      },
      {
        type: 'append',
        path: 'src/modules/{{kebabCase module}}/index.ts',
        pattern: /$/,
        template: 'export * from \'./{{kebabCase name}}.interface\';'
      }
    ]
  });
  
  // Générateur de test
  plop.setGenerator('test', {
    description: 'Générer un nouveau test',
    prompts: [
      {
        type: 'input',
        name: 'module',
        message: 'Nom du module existant:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du module est requis';
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nom du composant à tester:',
        validate: function(value) {
          if (/.+/.test(value)) {
            return true;
          }
          return 'Le nom du composant est requis';
        }
      },
      {
        type: 'list',
        name: 'testType',
        message: 'Type de test:',
        choices: [
          { name: 'Unitaire', value: 'unit' },
          { name: 'Intégration', value: 'integration' },
          { name: 'End-to-end', value: 'e2e' }
        ]
      }
    ],
    actions: function(data) {
      let testPath;
      
      switch(data.testType) {
        case 'unit':
          testPath = 'src/tests/unit/modules/{{kebabCase module}}/{{kebabCase name}}.test.ts';
          break;
        case 'integration':
          testPath = 'src/tests/integration/modules/{{kebabCase module}}/{{kebabCase name}}.test.ts';
          break;
        case 'e2e':
          testPath = 'src/tests/e2e/modules/{{kebabCase module}}/{{kebabCase name}}.test.ts';
          break;
      }
      
      return [
        {
          type: 'add',
          path: testPath,
          templateFile: 'templates/test.hbs',
          data: {
            testType: data.testType
          }
        }
      ];
    }
  });
};