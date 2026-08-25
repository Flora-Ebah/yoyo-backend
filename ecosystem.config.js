module.exports = {
  apps: [{
    name: "yoyo",
    script: "build/main.js",
    cwd: "./",
    instances: 1,
    exec_mode: "fork",
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    max_memory_restart: "1G",
    
    // Variables d'environnement par défaut (development)
    env: {
      NODE_ENV: "development",
      PORT: 30141
    },
    
    // Variables d'environnement pour production
    env_production: {
      NODE_ENV: "production",
      PORT: 3014
    },
    
    // Gestion des logs
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_file: "./logs/combined.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    merge_logs: true,
    time: true,
    
    // Ignorer certains fichiers/dossiers pour le watch
    ignore_watch: [
      "node_modules",
      "logs",
      "dist",
      ".git",
      ".env",
      "*.log"
    ]
  }],
  
  // Scripts de déploiement
  // Configuration pour authentification SSH par clé uniquement
  // 
  // IMPORTANT :
  // - GitLab : utilise automatiquement votre clé SSH par défaut (~/.ssh/id_rsa ou ~/.ssh/id_ed25519)
  // - Serveur VPS : PM2 utilisera aussi votre clé SSH par défaut pour se connecter
  // - Si vous avez une clé SSH spécifique pour le VPS, décommentez la ligne "key" ci-dessous
  //
  deploy: {
    production: {
      user: "utrondev_admin", // Utilisateur SSH sur le VPS (correspond au chemin /home/jordan)
      host: "ultrondev.com", // Adresse du VPS
      ref: "origin/main",
      // Utiliser SSH pour GitLab (fonctionne avec votre clé SSH déjà configurée)
      repo: "git@gitlab.com:yoyo-project/yoyo.git",
      path: "/home/utrondev_admin/services/yoyo", // Chemin où déployer sur le VPS
      "pre-deploy-local": "echo 'Déploiement en production...'",
      "post-deploy": "yarn install && yarn build && pm2 reload ecosystem.config.js --env production && pm2 save",
      "pre-setup": "echo 'Configuration du serveur...'",
      // Options SSH pour authentification par clé uniquement (pour connexion au VPS)
      "ssh_options": [
        "StrictHostKeyChecking=no",
        "UserKnownHostsFile=/dev/null",
        "IdentitiesOnly=yes",
        "PasswordAuthentication=no",
        "PubkeyAuthentication=yes"
      ],
      // Si votre clé SSH pour le VPS est différente de la clé par défaut, décommentez et spécifiez :
      // Utiliser le format Unix même sur Windows (PM2/SSH le convertira automatiquement)
      "key": "~/.ssh/id_ed25519"
      // Sinon, PM2 utilisera automatiquement ~/.ssh/id_rsa ou ~/.ssh/id_ed25519
    },
    development: {
      user: "utrondev_admin", // Utilisateur SSH sur le VPS (correspond au chemin /home/jordan)
      host: "ultrondev.com", // Adresse du VPS
      ref: "origin/dev",
      // Utiliser SSH pour GitLab (fonctionne avec votre clé SSH déjà configurée)
      repo: "git@gitlab.com:yoyo-project/yoyo.git",
      path: "/home/utrondev_admin/services/yoyo-dev",
      "post-deploy": "yarn install && yarn build && pm2 reload ecosystem.config.js --env development && pm2 save",
      // Options SSH pour authentification par clé uniquement (pour connexion au VPS)
      "ssh_options": [
        "StrictHostKeyChecking=no",
        "UserKnownHostsFile=/dev/null",
        "IdentitiesOnly=yes",
        "PasswordAuthentication=no",
        "PubkeyAuthentication=yes"
      ],
      // Si votre clé SSH pour le VPS dev est différente, décommentez et spécifiez :
      // Utiliser le format Unix même sur Windows (PM2/SSH le convertira automatiquement)
      "key": "~/.ssh/id_ed25519"
    }
  }
}

