import { IAdmin, AdminSet } from '../modules/admin/admin.model';
import { ProfileSet, IProfile } from '../modules/profile';
import coddyger, { env, IData, LoggerService, LogLevel } from 'coddyger';
import { collectConfigurationIssues } from '../config/security-check';

const daoProfile: IData<IProfile> = new ProfileSet();
const daoAdmin: IData<IAdmin> = new AdminSet();

export class MainHelper {
	static async generateDefaultProfile(): Promise<any> {
		try {
			// Vérifier si un profil super admin existe déjà
			const existingProfile: any = await daoProfile.exist({
				name: 'Super Administrateur'
			});

			if (existingProfile) {
				return existingProfile;
			}

			const profile: IProfile = {
				_id: coddyger.string.generateObjectId(),
				slug: coddyger.buildSlug('PRF'),
				name: 'Super Administrateur',
				ability: [
					{
						name: 'Tous les droits',
						subject: 'all',
						action: 'manage'
					}
				],
				status: 'active',
				user: null
			};

			// Générer le slug
			const lastProfile: any = await daoProfile.selectLatest();
			profile.slug = coddyger.buildSlug('PRF', lastProfile ? lastProfile.slug : null);

			// Sauvegarder le profil
			const savedProfile: any = await daoProfile.save(profile);
			if (savedProfile.error) {
				throw new Error('Erreur lors de la création du profil par défaut');
			}

			return profile;
		} catch (error) {
			console.error('Error in generateDefaultProfile:', error);
			return { error: true, data: error };
		}
	}

	static async generateDefaultAdmin(defaultProfile: IProfile): Promise<IAdmin | null> {
		try {
			// Check if default admin account exists
			const [email, password] = (process.env.DEFAULT_ACCOUNT ?? '').split(':');

			if (!email || !password) {
				console.warn('DEFAULT_ACCOUNT not properly configured in .env');
				return null;
			}

			// [SÉCURITÉ B-05] `SEEDERS_SETUP.md` publiait `admin@yoyocarte.com:admin`, et l'image
			// Docker copiait le fichier d'exemple comme configuration réelle : tout déploiement
			// créait au démarrage un administrateur dont les identifiants étaient publics.
			// `assertSecureConfiguration()` refuse déjà ce cas en production ; ici on refuse de
			// créer le compte plutôt que de le créer faible.
			if (collectConfigurationIssues().some(issue => issue.includes('DEFAULT_ACCOUNT'))) {
				LoggerService.log({
					type: LogLevel.Error,
					content: `Création du compte administrateur par défaut refusée : le mot de passe configuré pour ${email} est publié ou trop court.`,
					location: 'MainHelper',
					method: 'generateDefaultAdmin'
				});
				return null;
			}

			// Check if admin already exists
			const existingAdmin: any = await daoAdmin.selectOne({ email });
			if (existingAdmin) {
				return existingAdmin;
			}

			// Create new default admin
			const admin: IAdmin = {
				_id: coddyger.string.generateObjectId(),
				email,
				password: await coddyger.string.encryptPassword(password),
				type: 'interne',
				status: 'active',
				lastname: 'Administrateur',
				firstname: 'Système',
				profile: defaultProfile._id
			};

			// Generate slug
			const lastAdmin: any = await daoAdmin.selectLatest();
			admin.slug = coddyger.buildSlug('ADM', lastAdmin ? lastAdmin.slug : null);

			// Save admin
			const savedAdmin: any = await daoAdmin.save(admin);
			if (savedAdmin.error) {
				throw new Error('Error creating default admin account');
			}

			console.log('=====> Default admin account created successfully :', admin.email);

			return admin;
		} catch (error) {
			console.error('Error in generateDefaultAdmin:', error);
			return null;
		}
	}

	static async setDefaultProfile() {
		try {
			// First generate default profile
			const defaultProfile = await this.generateDefaultProfile();

			// Then generate default admin with this profile
			await this.generateDefaultAdmin(defaultProfile);

			return defaultProfile;
		} catch (error) {
			console.error('Error in setDefaultProfile:', error);
			return null;
		}
	}
}
