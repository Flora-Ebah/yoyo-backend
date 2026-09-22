import coddyger from 'coddyger';
import { BoutiqueManagerSet } from './boutique-manager.model';
import { PartnerSet } from '../partner/partner.model';
import { ClientService } from '../client/client.service';

const serviceLabel = 'BoutiqueManagerService';

/**
 * Gestion des gérants de boutique.
 *
 * On N'importe PAS `PartnerService` ici (qui, lui, connaîtra ce service) : on passe par le DAO
 * `PartnerSet` pour la vérification de propriété, afin d'éviter un cycle d'imports.
 */
export class BoutiqueManagerService {
  private readonly dao: BoutiqueManagerSet;
  private readonly partnerDao: PartnerSet;
  private readonly clientService: ClientService;

  constructor() {
    this.dao = new BoutiqueManagerSet();
    this.partnerDao = new PartnerSet();
    this.clientService = new ClientService();
  }

  private ownerIdOf(boutique: any): string | undefined {
    const u = boutique?.user;
    if (!u) return undefined;
    return typeof u === 'string' ? u : u._id?.toString();
  }

  /**
   * Invite un gérant sur une boutique : crée un compte client (téléphone + code) et le lien.
   * Retourne le code d'accès en clair UNE fois, pour que le propriétaire le transmette au gérant
   * (le SMS étant désactivé côté serveur).
   */
  async invite(payload: { ownerId: string; boutiqueId: string; name: string; phone: string }): Promise<any> {
    const { ownerId, boutiqueId, name, phone } = payload;

    // 1. La boutique existe et appartient bien au propriétaire connecté.
    const boutique: any = await this.partnerDao.selectOne({ _id: boutiqueId });
    if (!boutique || boutique.error) {
      return { success: false, message: 'Boutique introuvable.' };
    }
    if (this.ownerIdOf(boutique) !== String(ownerId)) {
      return { success: false, message: "Cette boutique ne vous appartient pas." };
    }

    // 2. Normaliser le téléphone et vérifier sa disponibilité.
    const formattedPhone = this.clientService.formatIvorianPhoneNumber(String(phone).trim());
    const validation = this.clientService.validateIvorianPhoneNumber(formattedPhone);
    if (!validation.isValid) {
      return { success: false, message: validation.message || 'Numéro de téléphone invalide.' };
    }
    const existing = await this.clientService.checkExistingCredentials(undefined, formattedPhone);
    if (existing.exists) {
      return { success: false, message: 'Ce numéro est déjà utilisé par un compte.' };
    }

    // 3. Générer un code d'accès à 6 chiffres.
    const accessCode = String(Math.floor(100000 + Math.random() * 900000));

    // 4. Créer le compte client du gérant — même recette que l'inscription (mot de passe chiffré),
    //    pour qu'il puisse se connecter normalement dans yoyo-pro avec téléphone + code.
    const last: any = await this.clientService.selectLatest();
    const managerId = coddyger.string.generateObjectId();

    // Le modèle Client exige firstname/lastname/email non vides. Le gérant se connecte par téléphone,
    // mais on doit remplir ces champs : on découpe le nom, et on génère un email de service unique
    // (basé sur l'id) — il n'est pas utilisé pour se connecter.
    const cleanName = this.clientService.formatName(String(name).trim()) || 'Gérant';
    const parts = cleanName.split(' ').filter(Boolean);
    const firstname = parts[0] || 'Gérant';
    const lastname = parts.length > 1 ? parts.slice(1).join(' ') : firstname;
    const serviceEmail = `gerant.${String(managerId).toLowerCase()}@gerant.yoyolacarte.com`;

    const managerClient: any = {
      _id: managerId,
      firstname,
      lastname,
      email: serviceEmail,
      contact: formattedPhone,
      password: await coddyger.string.encryptPassword(accessCode),
      slug: coddyger.buildSlug('CLT', last ? last.slug : null),
      isPartner: false,
      isManager: true,
      status: 'active'
    };

    const savedClient: any = await this.clientService.create(managerClient);
    if (savedClient?.error) {
      return { success: false, message: 'Impossible de créer le compte du gérant.' };
    }

    // 5. Créer le lien gérant ↔ boutique.
    const linkId = coddyger.string.generateObjectId();
    const saved: any = await this.dao.save({
      _id: linkId,
      boutique: boutiqueId,
      owner: ownerId,
      manager: managerId,
      managerName: managerClient.firstname,
      managerPhone: formattedPhone,
      status: 'active'
    });
    if (saved?.error) {
      return { success: false, message: "Le compte a été créé mais le lien a échoué." };
    }

    return {
      success: true,
      data: {
        _id: linkId,
        boutique: boutiqueId,
        manager: managerId,
        managerName: managerClient.firstname,
        managerPhone: formattedPhone,
        // À transmettre au gérant — n'est PAS stocké en clair.
        accessCode
      }
    };
  }

  /** Tous les gérants d'un propriétaire (toutes ses boutiques). */
  async listByOwner(ownerId: string): Promise<any[]> {
    const rows: any = await this.dao.selectHug({ owner: ownerId, status: { $nin: ['removed'] } });
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Liens où le compte connecté est le GÉRANT (les boutiques qu'il gère). Sert à l'app yoyo-pro à
   * détecter le mode « gérant » (vue réduite à une seule boutique).
   */
  async listByManager(managerClientId: string): Promise<any[]> {
    const rows: any = await this.dao.selectHug({ manager: managerClientId, status: 'active' });
    return Array.isArray(rows) ? rows : [];
  }

  /** Gérants d'une boutique donnée. */
  async listByBoutique(boutiqueId: string): Promise<any[]> {
    const rows: any = await this.dao.selectHug({ boutique: boutiqueId, status: { $nin: ['removed'] } });
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Retire un gérant : soft-delete du lien + désactivation de son compte (il ne pourra plus se
   * connecter). Vérifie que le lien appartient bien au propriétaire.
   */
  async remove(id: string, ownerId: string): Promise<any> {
    const link: any = await this.dao.selectOne({ _id: id });
    if (!link || link.error) {
      return { success: false, message: 'Gérant introuvable.' };
    }
    if (String(link.owner) !== String(ownerId)) {
      return { success: false, message: "Vous ne pouvez pas retirer ce gérant." };
    }

    await this.dao.update({ _id: id }, { status: 'removed' });
    // Désactiver le compte client du gérant pour couper l'accès.
    try {
      await this.clientService.update(String(link.manager), { status: 'inactive' } as any);
    } catch {
      /* best-effort : le lien retiré suffit déjà à retirer l'accès aux boutiques */
    }

    return { success: true, data: null };
  }

  /** Nombre total de gérants actifs (pour les cartes de stats admin). */
  async countActive(): Promise<number> {
    const rows: any = await this.dao.selectHug({ status: 'active' });
    return Array.isArray(rows) ? rows.length : 0;
  }

  /**
   * Boutiques (ids) qu'un compte client peut gérer en tant que GÉRANT (liens actifs).
   * Utilisé pour la résolution des boutiques accessibles dans yoyo-pro.
   */
  async getManagedBoutiqueIds(managerClientId: string): Promise<string[]> {
    const rows: any = await this.dao.selectHug({ manager: managerClientId, status: 'active' });
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r: any) => (r.boutique && typeof r.boutique === 'object' ? r.boutique._id : r.boutique))
      .filter(Boolean)
      .map((x: any) => x.toString());
  }
}
