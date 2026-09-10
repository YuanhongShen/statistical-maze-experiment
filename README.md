# Improved Statistical Maze

This folder contains the current implementation of the revised statistical maze experiment.

## Experiment Flow

1. Audio check.
2. Phase 1 passive familiarisation: participants see and hear a continuous stream of syllables from four trisyllabic words.
3. Phase 2 improved statistical maze:
   - Position 1 is a baseline trial: known word-onset syllable vs unattested foil syllable.
   - Position 2 and Position 3 are core transitional-probability trials: target syllable vs another legal syllable from the same position in a different word.
   - Feedback is smooth: the correct syllable is highlighted and the task advances automatically. There is no red-X retry loop.
4. Participants complete a short debrief form.
5. The full CSV dataset is posted to `save_data.php` and written into the `data/` folder.
6. Participants exit fullscreen and can be redirected to Prolific.

## Requirements

This experiment uses jsPsych 7.3.1.

The `jspsych/` directory must be located within this experiment directory for the experiment to run.

The 7.3.1 release can be found [here](https://github.com/jspsych/jsPsych/releases/tag/jspsych%407.3.1).

## How To Run

Open `index.html` with VSCode Live Server.

The main editable file is `exp.js`.

## Prolific Data Collection

Prolific recruits participants and appends URL parameters such as `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`.
The experiment reads those values in `exp.js` and adds them to every jsPsych data row.

To collect data:

1. Host this folder on a web server that supports PHP.
2. Make sure the server can write to the `data/` folder.
3. In `exp.js`, replace the empty `PROLIFIC_COMPLETION_URL` value with your Prolific completion URL.
4. Put the hosted `index.html` URL into Prolific as the study URL.
5. Run a pilot and confirm that a CSV file appears in `data/`.

The expected Prolific study URL format is:

`https://your-server.example/improved-statistical-maze/index.html`

Prolific will automatically add participant parameters when the study is launched.
