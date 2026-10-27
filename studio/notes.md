# Story Maker notes

## How to make a video
1. Create a project on the left.
2. 1. Script: upload or paste your SRT. Put picture tags like [1.1] before the word where each drawing should appear.
3. 2. Images & Effects: upload images named 1.png, 2.png... Each image is a 2 x 3 grid (n.1 n.2 n.3 on top, n.4 n.5 n.6 below). Pick effects per object, then Save effects.
4. 3. Play: press Build preview, then watch it.
5. 4. Make video: press Make the final video. It lands in out/studio.

## DeepSeek: rewrite an image prompt into the series style
Rewrite my image prompt below into this exact style. Keep my scene and objects, only change the style rules and format.

STYLE (copy these rules into the new prompt word for word):
- Generate an image. Minimalist hand-drawn sketch illustration, pure black ink pen sketch style, restrained Notion-like doodle aesthetic. Concept-driven, not realistic.
- Pure clean white background (#FFFFFF), crisp black ink lines.
- Manga-influenced black ink line art with light gray tones. Clothes and skin are ink and gray only, never brown or colored.
- Use only flat touches of red, orange and blue as accents (red for blood, impact bursts and claw marks). No other colors, no gradients, no textures, no 3D, no photographic detail.
- Simple outlines, a few lines per object, lots of empty space.
- All humans are simple faceless figures.
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
