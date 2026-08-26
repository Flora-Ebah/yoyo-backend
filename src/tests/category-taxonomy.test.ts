import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

/**
 * Le référentiel est lu depuis le fichier que consomme le seeder, et non recopié ici : ces tests
 * doivent échouer si la liste réellement injectée en base devient incohérente.
 */
const taxonomy = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), 'src', 'config', 'category-taxonomy.json'), 'utf8')
);

const FINAL_CATEGORIES: any[] = taxonomy.categories;
const RENAMES: Record<string, string> = taxonomy.renames;

/**
 * La taxonomie des métiers n'est pas un jeu de démonstration : c'est le référentiel que voient
 * les commerçants à la création d'une boutique et qui alimente la barre de filtres de l'app
 * Client. Une régression y est invisible en développement mais visible par tous les utilisateurs,
 * d'où ces garde-fous sur la forme des données.
 */
describe('[Référentiel] Catégories de commerçants', () => {
	it('déclare les 13 catégories du référentiel', () => {
		expect(FINAL_CATEGORIES).to.have.lengthOf(13);
	});

	it('ne contient aucun doublon de nom', () => {
		const names = FINAL_CATEGORIES.map((category: any) => category.name);
		expect(new Set(names).size).to.equal(names.length);
	});

	/**
	 * Le rang pilote l'ordre d'affichage : un trou ou un doublon rendrait la barre de filtres
	 * instable d'un appel à l'autre.
	 */
	it('attribue un rang unique et continu à partir de 1', () => {
		const positions = FINAL_CATEGORIES.map((category: any) => category.position).sort(
			(a: number, b: number) => a - b
		);

		expect(positions).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
	});

	/**
	 * Les applications mobiles rendent `icon` avec Ionicons et `color` tel quel : une icône vide
	 * ou une couleur mal formée passerait les tests d'API mais casserait l'affichage.
	 */
	it('renseigne une icône et une couleur hexadécimale pour chaque entrée', () => {
		FINAL_CATEGORIES.forEach((category: any) => {
			expect(category.icon, `icône manquante pour ${category.name}`).to.be.a('string').and.not.be.empty;
			expect(category.color, `couleur invalide pour ${category.name}`).to.match(/^#[0-9A-Fa-f]{6}$/);
			expect(category.description, `description manquante pour ${category.name}`).to.be.a('string').and.not.be
				.empty;
		});
	});

	it('utilise des couleurs distinctes', () => {
		const colors = FINAL_CATEGORIES.map((category: any) => category.color.toUpperCase());
		expect(new Set(colors).size).to.equal(colors.length);
	});

	/**
	 * Renommer préserve l'identifiant, donc les boutiques rattachées. Une cible absente du
	 * référentiel produirait une catégorie orpheline que le seeder signalerait ensuite comme
	 * obsolète — exactement ce que le renommage cherche à éviter.
	 */
	it('ne renomme que vers des catégories du référentiel', () => {
		const names = FINAL_CATEGORIES.map((category: any) => category.name);

		Object.entries(RENAMES).forEach(([from, to]) => {
			expect(names, `"${from}" renommée vers une cible inconnue "${to}"`).to.include(to);
		});
	});

	/**
	 * Une source qui figure déjà dans le référentiel serait renommée sur elle-même ou vers une
	 * autre entrée existante, créant un conflit de noms.
	 */
	it("ne renomme aucune catégorie déjà présente dans le référentiel", () => {
		const names = FINAL_CATEGORIES.map((category: any) => category.name);

		Object.keys(RENAMES).forEach(from => {
			expect(names, `"${from}" est à la fois source de renommage et cible du référentiel`).to.not.include(from);
		});
	});

	it('ne fait pas converger deux anciens noms vers la même catégorie', () => {
		const targets = Object.values(RENAMES);
		expect(new Set(targets).size).to.equal(targets.length);
	});
});
