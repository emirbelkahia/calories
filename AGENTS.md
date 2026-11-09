# Calorie Tracker

PWA Next.js. Le journal (repas, aliments, calories) vit dans IndexedDB via Dexie. Le menu de gauche et la page Aliments habituels sont en cours sur la branche `vocal-habits`. Rien de tout ça n’est en production tant que ce n’est pas mergé sur `master`.

`next.config.ts` a `agentRules: false`. Ne pas laisser Next régénérer ce fichier.

## Objectif du mode vocal

À l’oral, la personne dit un repas entier, sans formulaire. Exemple : « Petit-déjeuner, 30 grammes de flocons d’avoine, 200 millilitres de lait de soja, 30 grammes de mes protéines habituelles. »

L’app range ça comme une saisie à la main :

- date du jour si aucune date n’est dite
- le repas nommé (petit-déjeuner, déjeuner, dîner, en-cas), celui qui existe déjà ce jour-là
- une ligne par aliment, avec les grammes, les kcal et les macros
- ces lignes sont les mêmes `foodEntries` que le bouton Ajouter. Le journal les affiche, on peut les modifier et les supprimer.

Les millilitres sont dits à l’oral. La base continue de stocker des grammes. Densité 1 par défaut (150 ml de lait de soja deviennent 150 g), sauf si l’aliment a une autre densité.

## Trois couches, dans cet ordre

1. **Voxtral Mini Transcribe** (`voxtral-mini-transcribe-latest`), langue française. Il transcrit l’audio. On lui passe les phrases du tableau comme vocabulaire pour qu’il les écrive bien. Il ne choisit pas d’aliment, il n’écrit rien en base.
2. **Un modèle texte** lit la transcription et le tableau Aliments habituels (la phrase dite, le nom de l’aliment). Il renvoie une structure : repas ou non, et pour chaque aliment la quantité, l’unité, et la ligne du tableau. Il signale un doute. Il ne renvoie pas de calories.
3. **Le code** vérifie que chaque ligne existe dans le tableau ou dans les aliments de base. Il convertit les ml en grammes, calcule les kcal avec les valeurs pour 100 g déjà dans l’app, puis écrit avec `addFoodEntry` dans le repas du jour. Une ligne proposée par le modèle et absente du tableau est rejetée.

Le tableau est la liste des sens personnels (« mes protéines habituelles » vers une fiche précise). Le modèle texte fait le lien entre la phrase libre et une ligne de cette liste. Le code fait le calcul et l’écriture.

## Contrat de sortie du modèle texte

Modèle : **Mistral Small 4** (`mistral-small-latest`), température 0, structured output. Pas d’appel d’outil. Le modèle ne voit pas Dexie.

Il renvoie uniquement :

- `date` : chaîne vide si rien n’est dit (le code met la date du jour), `yesterday`, ou `YYYY-MM-DD` si une date est dite
- `meal` : `breakfast` | `lunch` | `dinner` | `snack`, ou une chaîne vide
- `items[]` : `spoken`, `quantity`, `unit` (`g` | `ml`), et soit un `aliasId` ou un `stapleId` copié dans la liste fournie, soit `unresolved` avec au plus trois ids candidats et une `question` courte. Un id absent est une chaîne vide.

Le schéma strict n’a pas de `null`. Le code lit une chaîne vide comme une absence.

Le code rejette tout id absent de la liste. Il convertit les ml, calcule les kcal, et n’écrit qu’après confirmation, via `addFoodEntry`. Une ligne `unresolved` n’est pas écrite. L’écran montre la question et le sélecteur d’aliment, pas un chat.

## Doutes et questions

S’il n’y a pas de ligne pour « mon huile d’olive habituelle », ou si deux lignes collent, le modèle le dit. L’interface demande une précision. La ligne douteuse n’est pas écrite. Les aliments déjà clairs peuvent apparaître dans le récap. Rien n’est enregistré sans confirmation.

Si le repas n’est pas dit, on demande lequel. On ne devine pas.

## Déjà en place

- Page Aliments habituels : phrase à gauche, aliment à droite (aliments sauvegardés, puis aliments de base via recherche).
- `resolveUtterance` dans `src/lib/voice-resolve.ts` : à partir d’items déjà découpés (repas, phrase, quantité, unité), il retrouve la fiche et calcule les macros. Il ne comprend pas une phrase libre.
- Sur le journal, `VoiceLog` envoie une phrase écrite à `mistral-small-latest` (`/api/voice/interpret`, température 0, schéma, sans outil). `applyVoicePlan` rejette les ids inconnus, convertit les ml, calcule les kcal, et n’écrit qu’après confirmation, via `addFoodEntry`.
- Pas de micro, pas d’appel Voxtral. La phrase est tapée.

## À ne pas faire

- Laisser Voxtral ou le modèle texte écrire les kcal, les macros, ou des lignes SQL.
- Matcher la transcription seulement par égalité avec le tableau et espérer que la phrase tombe juste.
- Créer un deuxième journal à côté de petit-déjeuner, déjeuner et dîner.
- Mettre la clé Mistral en base. Elle reste dans le `localStorage` de l’appareil.
