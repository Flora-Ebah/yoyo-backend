/**
 * Interface pour le module Login
 */
export interface ILogin {
	_id?: string;
	user: any; // Référence à l'ObjectId du client
	success: boolean;
	attempts: number;
	lastAttempt: Date;
	locked: boolean;
	lockExpiration?: Date;
	userAgent?: string;
	ip?: string;
	token?: string;
	status?: string;
	client?: string; // ID du client associé à cette connexion
	userIdentifier?: string; // Identifiant de l'utilisateur (login, email, contact)
}

export interface ILoginClient {
  login: string;
  password: string;
  ip: string;
  userAgent: string;
}