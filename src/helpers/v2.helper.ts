import { AxiosService } from 'coddyger';

export class V2Helper {
  private readonly axios: any;

  constructor() {
    this.axios = AxiosService.connect({
      baseURL: process.env.V2_API_URL || 'https://api-v2.example.com',
    });
  }

  /**
   * Vérifie si un utilisateur existe dans le système V2
   * @param login Identifiant de l'utilisateur (email ou téléphone)
   */
  async verifyUser(login: string): Promise<any> {
    try {
      const response = await this.axios.post('/verify-user', { login });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la vérification V2:', error);
      return null;
    }
  }

  /**
   * Tente de connecter un utilisateur via le système V2
   * @param login Identifiant de l'utilisateur
   * @param passcode Mot de passe
   */
  async login(login: string, passcode: string): Promise<any> {
    try {
      const response = await this.axios.post('/login', { login, passcode });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la connexion V2:', error);
      return { error: true, message: 'Échec de connexion au système V2' };
    }
  }
} 