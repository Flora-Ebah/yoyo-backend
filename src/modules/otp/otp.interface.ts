/**
 * Interface pour le module Otp (One-Time Password)
 */
export interface IOtp {
	_id?: string;
	code: string;           // Le code OTP généré
	login: string;          // Email ou numéro de téléphone du destinataire
	type: string;           // Type de login (email/phone)
	purpose: string;        // Objectif du code OTP (account_verification/password_reset/login_verification/transaction_confirmation/other)
	status: string;         // Status du code (active/used/expired)
	expiresAt: Date;        // Date d'expiration du code
	usedAt?: Date;          // Date d'utilisation du code
	attempts?: number;       // Nombre de tentatives d'utilisation
}