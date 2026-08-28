# UI brief — paste this into Claude

Everything below is the context a designer needs. Add your own question at the
end ("the briefing popup feels cramped", "make the Goals tab clearer", and so
on). Screenshots help more than description — take one and attach it.

---

I have a personal web app called Dagboek: a day planner with a voice diary
built into it. I use it on an iPhone, installed to the home screen, and my
partner has her own account. I want help improving the interface.

**What it is.** Five tabs along the bottom — Today, Calendar, Diary, Goals,
Inbox. A sticky header showing the screen name and date, a blue + button
bottom-right that opens a "New item" panel, and centred modal panels that scale
up from 92% for everything else. Tasks are rows in grouped cards, swipe right
to complete and left to delete.

**The look** is iOS, dark only. Black background, layered greys for cards, and
Apple's system colours as accents:

```
background     #000000
card           #1c1c1e
card raised    #2c2c2e / #3a3a3c
text           #ffffff, then 60% and 30% white for secondary and tertiary
blue   #0a84ff   green  #30d158   orange #ff9f0a
red    #ff453a   teal   #64d2ff   purple #bf5af2   yellow #ffd60a
radii  22 / 18 / 14 / 10 px, and pill
font   -apple-system (SF Pro)
```

Colours carry meaning already: blue is the accent and anything selected, green
is done, purple is goals and deadlines, yellow is diary entries and quotes,
orange is overdue or stale, red is delete.

**Constraints, which matter:**

- Hand-written HTML and CSS, no framework, no build step, no Tailwind. Give me
  plain CSS I can paste in.
- It must work in iPhone Safari. Respect safe-area insets, keep tap targets
  around 44px, and never put text below 16px in an input or iOS zooms the page.
- Dark theme only. Do not add a light mode.
- Keep the existing colour meanings above; do not invent a new palette.
- Motion is spring-based, quick and subtle. Nothing bouncy or slow.

**What I want:** clearer hierarchy and better spacing, while it still feels
like a native iOS app rather than a website. Tell me what is wrong before you
tell me what to change, and say which changes matter most.
