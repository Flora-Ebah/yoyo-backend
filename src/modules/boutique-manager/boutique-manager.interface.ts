import { Schema } from 'mongoose';

/**
 * Lien « gérant de boutique ».
 *
 * Un partenaire (propriétaire) peut posséder plusieurs boutiques. Pour éviter de partager son
 * compte, il invite des **gérants** : chaque gérant reçoit son PROPRE compte client (téléphone +
 * code), rattaché à UNE boutique. Ce document matérialise ce rattachement.
 *
 * - `manager` : le compte client du gérant (créé à l'invitation).
 * - `owner`   : le propriétaire (compte partenaire) qui a invité.
 * - `boutique`: la boutique (Partner) que le gérant peut gérer.
 *
 * La résolution des boutiques accessibles à un utilisateur connecté (dans yoyo-pro) est :
 *   propriétaire → toutes ses boutiques ; gérant → la/les boutique(s) de ses liens actifs.
 */
export interface IBoutiqueManager {
  _id: Schema.Types.ObjectId;

  boutique: any; // ref Partner
  owner: any; // ref Client (propriétaire)
  manager: any; // ref Client (gérant)

  // Instantané pratique pour l'affichage/liste sans repopulation systématique.
  managerName: string;
  managerPhone: string;

  status: 'active' | 'inactive' | 'suspended' | 'removed';

  createdAt?: Date;
  updatedAt?: Date;
}
