# Story Maker notes

## How to make a video
1. Create a project on the left.
2. 1. Script: upload or paste your SRT. Put picture tags like [1.1] before the word where each drawing should appear.
3. 2. Images & Effects: upload images named 1.png, 2.png... Each image is a 2 x 3 grid (n.1 n.2 n.3 on top, n.4 n.5 n.6 below). Pick effects per object, then Save effects.
4. 3. Play: press Build preview, then watch it.
5. 4. Make video: press Make the final video. It lands in out/studio.
6. Optional: Make a Short (9:16) for YouTube Shorts / TikTok. Line up several videos; they render one after another (queue).

## Studio extras
- Script tab: Check script finds problems before you build (missing sounds, loops that never stop, [dark] without [light], missing images). Click a problem to jump to its line.
- Script tab: Suggest sounds adds sounds before words like roar, scream, door, thunder. Undo removes them all.
- Play tab: the strip under the player shows pictures, objects, effects and sounds. Click it to jump. Rebuild keeps your place.
- Settings: word-by-word captions, background music (ducks under the voice), Hook intro (opens with the most dramatic line; put [hook] before a sentence to choose it).
- Duplicate (next to the project name) copies settings, music, end card and YouTube text to the next part.
- YouTube tab: title/description/tags templates with {series} and {n}, plus a thumbnail maker.

## Art style (paste at the top of every image prompt)
Generate an image. Minimalist hand-drawn sketch illustration, pure black ink pen sketch style, restrained Notion-like doodle aesthetic. Concept-driven, not realistic. Pure clean white background (#FFFFFF), crisp black ink lines. Manga-influenced black ink line art with light gray tones. Clothes and skin are ink and gray only, never brown or colored. Use only flat touches of red, orange and blue as accents (red for blood, impact bursts and claw marks; orange for alarms, light and sound lines; blue for water and sweat). No other colors, no gradients, no textures, no 3D, no photographic detail. Simple outlines, a few lines per object, lots of empty space. Every person has a simple, expressive manga-doodle face (see Faces below). 16:9 landscape. Absolutely NO text, letters, numbers, words, labels, question marks, exclamation marks or equals signs anywhere in the image (signs, screens, maps and pages stay blank or use simple icons). This is one panel of a fictional storyboard, drawn in a cartoon doodle style.

Faces: every person has a clean, simple manga-doodle face in black ink: small solid oval eyes with a tiny white highlight, simple curved eyebrows, a short line for the nose and a short mouth line. Faces stay minimal (no realistic shading, no detailed lips or eyelashes) but clearly show the emotion of the moment: fear, anger, grief, relief, a small smile. Keep each character's face exactly the same in every image, following their Face description. Small or far-away figures may use just dots for eyes. Raiders keep their faces hidden by hoods and scarves.

Layout: 6 separate objects in two rows of three, with wide empty space between every object so none overlap or touch. Every object stays fully inside its own cell. Reading order: top row left to right, then bottom row left to right.

Characters: only draw the characters named in CAPITALS in each object; an object that names no one contains no people at all. Do not add any other people or extra animals. (Character looks are in the studio: 1. Script > Characters > Copy for prompt.)

Bunker mood line (add after the style):
Dramatic, tense, frightening mood with quiet moments of warmth. Violence is only suggested: guns, gunfire bursts, shoves, punches, bruises, small cuts and small red bloodstains are allowed, but no detailed wounds and no gore. Outdoor scenes show open sky and ground only, never bunker walls, pipes or bunks.

Pangaea mood line (add after the style):
Dramatic, brutal, frightening prehistoric survival horror with quiet moments of warmth. Violence is shown clearly in an ink comic style: bites, claws, spears, torn clothing, blood splatter and blood trails in red are allowed, attacks can be shown mid-strike, but no exposed organs and no detailed anatomy.

## Faces (paste after the art style)
Every person has a clean, simple manga-doodle face in black ink: small solid oval eyes with a tiny white highlight, simple curved eyebrows, a short line for the nose and a short mouth line. Faces stay minimal (no realistic shading, no detailed lips or eyelashes) but clearly show the emotion of the moment: fear, anger, grief, relief, a small smile. Keep each character's face exactly the same in every image. Small or far-away figures may use just dots for eyes. Raiders keep their faces hidden by hoods and scarves.

Bunker faces:
ADA face = about fifteen; wide frightened eyes; thin face; long braid over one shoulder (mostly shown as a small icon in speech bubbles).
JONAH face = late thirties; tired hooded eyes; heavy eyebrows; crooked nose; short dark stubble; deep lines across the forehead; rarely smiles.
LENA face = early twenties; big round dark eyes; soft straight eyebrows; small nose; a small beauty mark under her left eye; bangs touching her eyebrows; expressive, easy to read.
NIA face = late twenties; warm wide eyes; round face; light freckles across the cheeks; an easy, kind smile.
RAIDERS face = no faces shown: hoods pulled low, eyes in shadow, lower face wrapped in a dark scarf.
SCALED CREATURE face = reptile head; pale slit eyes; rows of needle teeth; flaring nostrils.
VOSS face = long pale face; cold narrow eyes; thin lips; clean-shaven; a scar through his left eyebrow; calm, unreadable expression.
YOU face = early twenties; narrow dark eyes with tired shadows under them; thick straight eyebrows usually pulled into a frown; sharp jaw; small scar on the chin; a crooked half-smile when he jokes.

Pangaea faces:
AUNT MIRA face = gentle tired eyes; thin face; soft worried mouth.
CLAIRE face = big bright eyes; button nose; round cheeks.
CYNTHIA face = sharp clever eyes; freckles; small determined mouth.
DAX face = narrow eyes; permanent scowl; pinched mouth.
FATHER face = deep-set eyes; heavy eyebrows; square jaw under a short dark beard; weathered face.
GRANDPA face = sunken wise eyes; bushy white eyebrows; long white beard; hollow cheeks.
JUBEL (YOU) face = big curious dark eyes that look older than his age; round face (baby or child, as the scene says); thoughtful, often serious eyebrows.
KAEL face = weathered face; short beard; squinting hunter eyes.
KESSA face = deeply wrinkled face; squinting eyes; a few missing teeth.
LOLA (GRANDMA) face = crinkled kind eyes; deep smile lines; gentle smile; wrinkled cheeks.
MIKE face = bright determined eyes; wide grin with a missing front tooth (as a child); eyebrows that shoot up when he is excited.
MOTHER face = kind almond-shaped eyes; soft eyebrows; smile lines at the corners of her eyes; calm mouth.
PELL face = big shy eyes; round cheeks; small mouth that barely speaks.
ROOK face = sharp focused eyes; scar across one cheek; strong jaw; rarely smiles.
TOMO face = big sad eyes; thin face; small pointed chin.
UNCLE TARN face = small fierce eyes; broken nose; thick beard; loud wide mouth.

## DeepSeek: make a tagged SRT from a story
1. Attach the sound list: C:\Users\Admin\OneDrive\Desktop\DCODE\Story Maker\sfx\SOUND_LIST.txt
   (all 2,218 sound paths; if it's missing or old, ask Claude to remake it)
2. Paste the prompt below, then your story under "MY STORY:".
3. Paste DeepSeek's SRT into 1. Script and Save. Copy its 60-object list into your image prompts.
4. Any sound DeepSeek invented shows "! sound not found" in the build log; replace it with + sound under that object.


Turn my story below into a narrated explainer video script in SRT format for my video tool. Narration is second person ("you"), dark and gripping, about 5 minutes (about 900 words).

SRT RULES:
- Normal SRT: number, time line (00:00:00,000 --> 00:00:04,500), text, blank line.
- Each subtitle is 1-2 short lines, about 3 to 6 seconds. Time it at about 3 words per second, with no gaps and no overlaps.
- Use plain straight quotes. No emojis, no stage directions, no speaker names.

PICTURE TAGS (most important):
- The video has 10 images. Each image is a grid of 6 objects: [n.1] [n.2] [n.3] on top, [n.4] [n.5] [n.6] below.
- Put a tag like [1.1] right before the word where that drawing should appear. Use all 60 tags in order: [1.1] to [1.6], then [2.1] to [2.6], up to [10.6]. Spread them evenly, about one every 5 seconds.

EFFECT TAGS (optional, put right before the word they hit):
[shake] [shake:big] [boom] [flash] [flash:red] [knock:3] [zoom] [heartbeat:3] [red:3] [glitch] [rewind] [fade] [dark] [light] [whole] [pause:1] [label: Day 2]
- Every [dark] needs a [light] later. Use [boom] or [shake] for hits, [flash] for gunshots or lightning, [rewind] for flashbacks, [label: ...] for time jumps.

SOUND TAGS (optional, only use file paths that appear exactly in the attached SOUND_LIST.txt, never invent one):
[sfx:fight/sword_slash.mp3 vol=40] plays once at that word.
[sfx:human/heartbeat_single.mp3 vol=45 x3] plays 3 times.
[amb:ambience/scary_woods_at_night.mp3 vol=15 loop fade-in] background loop that keeps playing.
[amb-stop:scary_woods_at_night] stops that loop (file name only, no folder, no .mp3).
- Volumes: background loops 10-20, normal sounds 30-45, big hits and roars 50-65.
- About one sound every 1-2 subtitles. At most 2 background loops at once, and stop each loop when the scene changes.

AFTER THE SRT, list the 60 objects in order (1.1 to 10.6), one short line each describing what to draw for that moment, so I can make the images.

MY STORY:

## DeepSeek: rewrite an image prompt into the series style
Rewrite my image prompt below into this exact style. Keep my scene and objects, only change the style rules and format.

STYLE (copy these rules into the new prompt word for word):
- Generate an image. Minimalist hand-drawn sketch illustration, pure black ink pen sketch style, restrained Notion-like doodle aesthetic. Concept-driven, not realistic.
- Pure clean white background (#FFFFFF), crisp black ink lines.
- Manga-influenced black ink line art with light gray tones. Clothes and skin are ink and gray only, never brown or colored.
- Use only flat touches of red, orange and blue as accents (red for blood, impact bursts and claw marks). No other colors, no gradients, no textures, no 3D, no photographic detail.
- Simple outlines, a few lines per object, lots of empty space.
- All humans have simple expressive manga-doodle faces: small solid oval eyes with a tiny highlight, simple eyebrows, a short nose line and a short mouth line, same face for each character every time.
- 16:9 landscape. Absolutely NO text, letters, numbers, words, labels, question marks, exclamation marks or equals signs anywhere in the image.

LAYOUT:
- 6 separate objects in two rows of three, with wide empty space between every object so none overlap or touch. Every object stays fully inside its own cell.
- Reading order: top row left to right, then bottom row left to right. Number the objects 1 to 6.

CHARACTERS:
- Write each character's name in CAPITALS inside the objects (for example "YOU", "MOTHER").
- Before the objects, give one short fixed description for each character that appears in this image only. Don't describe characters who aren't in it.
- Add this rule: "Only draw the characters named in CAPITALS in each object; an object that names no one contains no people at all. Do not add any other people or extra animals."
- Put "(no people)" at the end of any object that has no person in it.

Output only the finished prompt, nothing else.

MY PROMPT:

## Fix: ChatGPT added text or symbols
remove all text, letters, numbers and symbols, keep everything else the same

## Fix: objects touching or overlapping
more empty space between objects, two rows of three, every object fully inside its own cell

## Fix: blocked by content policy
Same image, but show the violence a little less directly: keep the blood splatter and claw marks, but no wounds.

## YouTube description template
Part N: TITLE

ONE OR TWO SENTENCE HOOK ABOUT THIS PART.

Part N+1 drops tomorrow.

Subscribe so you don't miss the next part.

#storytime #animation #survivalstory #doodleanimation

## Pangaea: title + description (all parts, no spoilers)
Title:
I Died in a Flood and Woke Up in Pangaea (Part #)

Description:
I Died in a Flood and Woke Up in Pangaea – Part #

You were twelve when the floodwater took you. Then you opened your eyes as a baby in a world where dinosaurs never died. No phones. No cities. Just a small family in a cave, a valley full of giants, and a head full of everything you learned in your old life.

Every day is a fight to survive. Every mistake costs someone. And the further you go, the stranger this world gets.

New part every day.

Subscribe so you don't miss the next part.

#reincarnated #pangaea #dinosaurs #survival #storytime #animation #survivalstory #prehistoric #doodleanimation #isekai

Tags:
reincarnated in pangaea, dinosaur survival story, isekai, prehistoric survival, animated story, doodle animation, dinosaurs, storytime, survival story, jurassic

## Bunker: title + description (all parts, no spoilers)
Title:
Trapped in a Bunker With My Ex (Part #)

Description:
Trapped in a Bunker With My Ex – Part #

The world ended the day you were supposed to fly away. Now you're locked underground for 60 days with the one person you just broke up with: Lena. One bunker, one door, not enough supplies, and too many things outside trying to get in.

Survive the days. Survive each other.

New part every day.

Subscribe so you don't miss the next part.

#trappedwithmyex #survival #apocalypse #bunker #storytime #animation #survivalstory #60days #doodleanimation #ex

Tags:
survival story, apocalypse, bunker, trapped with my ex, animated story, doodle animation, 60 days, storytime

## Effects cheat sheet
shake, shake:small, shake:big - camera shake
boom - huge hit
knock, knock:3 - knocking
flash, flash:red, flash:orange - screen flash
zoom - quick zoom punch
heartbeat:3 - heartbeat pulse for 3s
red:3 - red alarm tint for 3s
glitch - glitch, rewind - flashback rewind, fade - fade to black
dark / light - night tint on / off
whole - show the whole image
pause:1 - 1 second of silence
label: Day 1 - text label on screen
subscribe - subscribe pop-up

## Sound tags (files in Story Maker\sfx, see sfx\README.md)
[sfx:fight/sword_slash.mp3 vol=40] - one-shot sound at this word
[sfx:human/fast_heartbeat.mp3 vol=35 fade-out] - fade at the end
[amb:ambience/scary_woods_at_night.mp3 vol=15 loop fade-in] - background loop
[amb-stop:scary_woods_at_night] - stop that loop here
[sfx:human/heartbeat_single.mp3 vol=45 x3]   plays 3 times back to back
Easier: Images & Effects > + sound under an object (search, preview, add).
vol is percent: loops 8-20, hits 30-60. Press Rebuild preview to hear changes.
