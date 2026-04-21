const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "lmrtfy-reloaded";

export class LMRTFYRoller extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(actors, data) {
        super();
        this.actors = actors;
        this.data = data;
        this.abilities = data.abilities;
        this.saves = data.saves;
        this.skills = data.skills;
        this.advantage = data.advantage;
        this.mode = data.mode;
        this.message = data.message;
        this.tables = data.tables;
        this.chooseOne = data.chooseOne ?? false;

        if (game.system.id === 'pf2e') {
            this.dc = data.dc;
            this.pf2Roll = '';
        }

        if (game.system.id === 'demonlord') {
            this.boonsBanes = data.boonsBanes;
            this.additionalModifier = data.additionalModifier;
        }

        if (game.system.id === 'wfrp4e') {
            this.difficulty = data.difficulty;
            this.slBonus = data.slBonus;
        }

        if (data.title) {
            this.options.window.title = data.title;
        }

        if (game.settings.get('lmrtfy', 'enableParchmentTheme')) {
            this.options.classes.push('lmrtfy-parchment');
        }

        this.pf2eRollFor = {
            ABILITY: "ability",
            SAVE: "save",
            SKILL: "skill",
            PERCEPTION: "perception",
        }

        this.hasMidi = game.modules.get("midi-qol")?.active;
        this.midiUseNewRoller = foundry.utils.isNewerVersion(game.modules.get("midi-qol")?.version, "10.0.26");

        Handlebars.registerHelper('canFailAbilityChecks', function (name, ability) {
            if (LMRTFY.canFailChecks) {
                return `<div>` +
                        `<button type="button" class="lmrtfy-ability-check-fail" data-action="failAbilityCheck" data-ability="${ability}" disabled>${game.i18n.localize('LMRTFY.AbilityCheckFail')} ${game.i18n.localize(name)}</button>` +
                        `<div class="lmrtfy-dice-tray-button enable-lmrtfy-ability-check-fail" data-action="toggleFailAbility" data-ability="${ability}" title="${game.i18n.localize('LMRTFY.EnableChooseFail')}">` +
                            `${LMRTFY.d20Svg}` +
                        `</div>` +
                    `</div>`;
            } else {
                return '';
            }
        });

        Handlebars.registerHelper('canFailSaveChecks', function (name, ability) {
            if (LMRTFY.canFailChecks) {
                return `<div>` +
                        `<button type="button" class="lmrtfy-ability-save-fail" data-action="failAbilitySave" data-ability="${ability}" disabled>${game.i18n.localize('LMRTFY.SavingThrowFail')} ${game.i18n.localize(name)}</button>` +
                        `<div class="lmrtfy-dice-tray-button enable-lmrtfy-ability-save-fail" data-action="toggleFailSave" data-ability="${ability}" title="${game.i18n.localize('LMRTFY.EnableChooseFail')}">` +
                            `${LMRTFY.d20Svg}` +
                        `</div>` +
                    `</div>`;
            } else {
                return '';
            }
        });

        Handlebars.registerHelper('canFailSkillChecks', function (name, skill) {
            if (LMRTFY.canFailChecks) {
                return `<div>` +
                        `<button type="button" class="lmrtfy-skill-check-fail" data-action="failSkillCheck" data-skill="${skill}" disabled>${game.i18n.localize('LMRTFY.SkillCheckFail')} ${game.i18n.localize(name)}</button>` +
                        `<div class="lmrtfy-dice-tray-button enable-lmrtfy-skill-check-fail" data-action="toggleFailSkill" data-skill="${skill}" title="${game.i18n.localize('LMRTFY.EnableChooseFail')}">` +
                            `${LMRTFY.d20Svg}` +
                        `</div>` +
                    `</div>`;
            } else {
                return '';
            }
        });
    }

    static DEFAULT_OPTIONS = {
        id: "lmrtfy-roller",
        classes: ["lmrtfy", "lmrtfy-roller"],
        position: { width: 400, height: "auto" },
        window: { title: "LMRTFY.Title", resizable: true },
        actions: {
            abilityCheck:       LMRTFYRoller.prototype._onAbilityCheck,
            failAbilityCheck:   LMRTFYRoller.prototype._onFailAbilityCheck,
            toggleFailAbility:  LMRTFYRoller.prototype._onToggleFailAbilityRoll,
            abilitySave:        LMRTFYRoller.prototype._onAbilitySave,
            failAbilitySave:    LMRTFYRoller.prototype._onFailAbilitySave,
            toggleFailSave:     LMRTFYRoller.prototype._onToggleFailSaveRoll,
            skillCheck:         LMRTFYRoller.prototype._onSkillCheck,
            failSkillCheck:     LMRTFYRoller.prototype._onFailSkillCheck,
            toggleFailSkill:    LMRTFYRoller.prototype._onToggleFailSkillRoll,
            customFormula:      LMRTFYRoller.prototype._onCustomFormula,
            initiative:         LMRTFYRoller.prototype._onInitiative,
            deathSave:          LMRTFYRoller.prototype._onDeathSave,
            perception:         LMRTFYRoller.prototype._onPerception,
            rollTable:          LMRTFYRoller.prototype._onRollTable,
        },
    };

    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/roller.html` },
    };

    static requestAbilityChecks(actor, abilities, options={}) {
        if (!actor || !abilities) return;
        if (typeof(abilities) === "string") abilities = [abilities];
        const data = foundry.utils.mergeObject(options, {
            abilities: [],
            saves: [],
            skills: []
        }, {inplace: false});
        data.abilities = abilities;
        new LMRTFYRoller([actor], data).render(true);
    }
    static requestSkillChecks(actor, skills, options={}) {
        if (!actor || !skills) return;
        if (typeof(skills) === "string") skills = [skills];
        const data = foundry.utils.mergeObject(options, {
            abilities: [],
            saves: [],
            skills: []
        }, {inplace: false});
        data.skills = skills;
        new LMRTFYRoller([actor], data).render(true);
    }
    static requestSavingThrows(actor, saves, options={}) {
        if (!actor || !saves) return;
        if (typeof(saves) === "string") saves = [saves];
        const data = foundry.utils.mergeObject(options, {
            abilities: [],
            saves: [],
            skills: []
        }, {inplace: false});
        data.saves = saves;
        new LMRTFYRoller([actor], data).render(true);
    }

    async _prepareContext(options) {
        let note = ""
        switch (game.system.id) {
            case 'demonlord':
                if (this.boonsBanes > 0 && this.advantage == 1)  note += game.i18n.localize("LMRTFY.DemonLordNote") + game.i18n.format("LMRTFY.DemonLordBoonsNote", { boonsBanes :this.boonsBanes});
                if (this.boonsBanes > 0 && this.advantage == -1) note += game.i18n.localize("LMRTFY.DemonLordNote") + game.i18n.format("LMRTFY.DemonLordBanesNote", { boonsBanes :this.boonsBanes});
                if (this.additionalModifier !== 0  && this.additionalModifier !==undefined)
                {
                    if (note.length)
                        note +=  game.i18n.localize("LMRTFY.DemonLordAnd") + this.additionalModifier;
                    else
                        note = game.i18n.localize("LMRTFY.DemonLordNote") + this.additionalModifier;
                }
                if (note.length)  note += '.'
                break;
            default:
                if (this.advantage == 1)
                    note = game.i18n.localize("LMRTFY.AdvantageNote");
                else if (this.advantage == -1)
                    note = game.i18n.localize("LMRTFY.DisadvantageNote");
                break;
        }

        let abilities = {}
        let saves = {}
        let skills = {}
        this.abilities.forEach(a => abilities[a] = LMRTFY.abilities[a])
        this.saves.forEach(a => saves[a] = LMRTFY.saves[a])
        this.skills
            .sort((a, b) => {
                const skillA = (LMRTFY.skills[a]?.label) ? LMRTFY.skills[a].label : LMRTFY.skills[a];
                const skillB = (LMRTFY.skills[b]?.label) ? LMRTFY.skills[b].label : LMRTFY.skills[b];
                game.i18n.localize(skillA).localeCompare(skillB)
            })
            .forEach(s => {
                if (game.system.id === 'wfrp4e') {
                    skills[s] = s;
                } else {
                    const skill = (LMRTFY.skills[s]?.label) ? LMRTFY.skills[s].label : LMRTFY.skills[s];
                    skills[s] = skill;
                }
            });

        const data = {
            actors: this.actors,
            abilities: abilities,
            saves: saves,
            skills: skills,
            note: note,
            message: this.message,
            customFormula: this.data.formula || false,
            deathsave: this.data.deathsave,
            initiative: this.data.initiative,
            perception: this.data.perception,
            tables: this.tables,
            chooseOne: this.chooseOne,
        };

        return data;
    }

    _checkClose() {
        const hasEnabled = this.element.querySelector("button:not([disabled])");
        if (!hasEnabled || this.chooseOne) this.close();
    }

    _disableButtons(target) {
        target.disabled = true;

        if (LMRTFY.canFailChecks) {
            const buttonSelector = `${target.className}`;
            let oppositeSelector = "";
            let dataSelector = "";

            if (
                target.className.indexOf('ability-check') > 0 ||
                target.className.indexOf('ability-save') > 0
            ) {
                dataSelector = `[data-ability *= '${target?.dataset?.ability}']`;
            } else {
                dataSelector = `[data-skill *= '${target?.dataset?.skill}']`;
            }

            if (target.className.indexOf('fail') > 0) {
                oppositeSelector = target.className.substring(0, target.className.indexOf('fail') - 1);
            } else {
                oppositeSelector = `${target.className}-fail`;
            }

            const enableButton = document.querySelector(`.enable-${buttonSelector}${dataSelector}`);
            if (enableButton) {
                enableButton.disabled = true;
                enableButton.classList.add('disabled-button');
            }

            const oppositeButton = document.querySelector(`.${oppositeSelector}${dataSelector}`);
            if (oppositeButton) oppositeButton.disabled = true;
        }
    }

    _getRollOptions(event, failRoll) {
        let options;
        switch(this.advantage) {
            case -1:
                options = {... LMRTFY.disadvantageRollEvent };
                break;
            case 0:
                options = {... LMRTFY.normalRollEvent };
                break;
            case 1:
                options = {... LMRTFY.advantageRollEvent };
                break;
            case 2:
                options = { event: event };
                break;
        }

        if (failRoll) {
            options["parts"] = [-100];
        }

        return options;
    }

    async _makeRoll(event, target, rollMethod, failRoll, ...args) {
        let options = this._getRollOptions(event, failRoll);                

        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));

            // system specific roll handling
            switch (game.system.id) {
                case "pf2e": {
                    switch (this.pf2Roll) {
                        case this.pf2eRollFor.ABILITY:
                            const modifier = LMRTFY.buildAbilityModifier(actor, args[0]);
                            game.pf2e.Check.roll(modifier, { type: 'skill-check', dc: this.dc, actor }, event);
                            break;

                        case this.pf2eRollFor.SAVE:
                            const save = actor.saves?.[args[0]]?.check;
                            if (!save) continue;
                            const saveOptions = actor.getRollOptions(['all', `${save.ability}-based`, 'saving-throw', save.name]);
                            save.roll({ event, saveOptions, dc: this.dc });
                            break;

                        case this.pf2eRollFor.SKILL:
                            // system specific roll handling
                            const skill = actor.system.skills[args[0]];
                            // roll lore skills only for actors who have them ...
                            if (!skill) continue;

                            const skillOptions = actor.getRollOptions(['all', `${skill.ability ?? 'int'}-based`, 'skill-check', skill.name]);
                            skill.roll({ event, skillOptions, dc: this.dc });
                            break;

                        case this.pf2eRollFor.PERCEPTION:
                            if (!actor.perception?.roll) continue;
                            const precOptions = actor.getRollOptions(['all', 'wis-based', 'perception']);
                            actor.perception.roll({ event, precOptions, dc: this.dc });
                            break;
                    }

                    break;
                }

                case "foundry-chromatic-dungeons": {
                    const key = args[0];
                    const {attributes, attributeMods, saves} = actor.system;
                    if (!attributes || !attributeMods) {
                        console.warn("LMRTFY | Chromatic Dungeons: actor.system data structure not found.");
                        continue;
                    }
                    let label, formula, target;

                    switch (rollMethod) {
                        case 'attributeRoll':
                            label = LMRTFY.abilities[key];
                            formula = `1d20-${attributeMods[key]}`;
                            target = attributes[key];
                            break;
                        case 'saveRoll':
                            label = LMRTFY.saves[key];
                            formula = `1d20+${saves.mods[key]}`;
                            target = saves.targets[key];
                            break;
                    }

                    actor[rollMethod](game.i18n.localize(label), formula, target);
                    break;
                }

                case "degenesis": {
                    if (typeof actor[rollMethod] !== 'function') {
                        console.warn("LMRTFY | Degenesis: roll method not found on actor.");
                        continue;
                    }
                    const key = args[0];
                    actor[rollMethod].call(actor, key, false)
                    break;
                }

                case "demonlord": {
                    if (typeof actor.rollAttributeChallenge !== 'function' || typeof actor.getAttribute !== 'function') {
                        console.warn("LMRTFY | Demonlord: rollAttributeChallenge or getAttribute not found on actor.");
                        continue;
                    }
                    const key = args[0];
                    switch(this.advantage) {
                      case 0:
                        await actor.rollAttributeChallenge(actor.getAttribute(key), 0, 0)
                        break;
                      case 1:
                        await actor.rollAttributeChallenge(actor.getAttribute(key), this.boonsBanes, this.additionalModifier)
                        break;
                      case -1:
                        await actor.rollAttributeChallenge(actor.getAttribute(key), (this.boonsBanes)*-1, this.additionalModifier)
                        break;
                      case 2:
                        await actor[rollMethod].call(actor, ...args, options);
                        break;
                    }
					break;
                }

                case "wfrp4e": {
                    if (typeof actor[rollMethod] !== 'function') {
                        console.warn(`LMRTFY | WFRP4e: actor.${rollMethod} not found.`);
                        continue;
                    }
                    const key = args[0];
                    await actor[rollMethod].call(actor, key, {
                        fields: {
                            difficulty: this.difficulty || "challenging",
                            slBonus: this.slBonus || 0
                        },
                        skipTargets: true
                    });
                    break;
                }

                default: {
                    await actor[rollMethod].call(actor, ...args, options);
                }
            }
        }

        game.settings.set("core", "rollMode", rollMode);

        this._disableButtons(target);
        this._checkClose();
    }

    _makePF2EInitiativeRoll(event, target) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            const initiative = actor.system?.attributes?.initiative;
            if (!initiative?.roll) {
                console.warn("LMRTFY | PF2e: actor.system.attributes.initiative not found, falling back to rollInitiative.");
                actor.rollInitiative();
                continue;
            }
            const rollNames = ['all', 'initiative'];
            if (initiative.ability === 'perception') {
                rollNames.push('wis-based');
                rollNames.push('perception');
            } else {
                const skill = actor.system.skills[initiative.ability];
                rollNames.push(`${skill.ability}-based`);
                rollNames.push(skill.name);
            }
            const options = actor.getRollOptions(rollNames);
            initiative.roll({ event, options });
        }

        game.settings.set("core", "rollMode", rollMode);

        target.disabled = true;
        this._checkClose();
    }

    _tagMessage(candidate, data, options) {
        candidate.updateSource({"flags.lmrtfy": {"message": this.data.message, "data": this.data.attach, "blind": candidate.blind}});
    }

    _makeDemonLordInitiativeRoll(event, target) {
        // save the current roll mode to reset it after this roll
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        if (game.combat?.combatants !== undefined) {
            let combatantFound
            for (let actor of this.actors) {
                combatantFound = null
                for (const combatant of game.combat.combatants) {
                    if (combatant.actor?.id === actor.id) {
                        combatantFound = combatant
                    }
                }
                if (combatantFound) {
                    game.combat.rollInitiative(combatantFound.id)
                } else {
                    ui.notifications.warn(game.i18n.localize("LMRTFY.DemonLordNoCombat"));
                }
            }
        } else {
            ui.notifications.warn(game.i18n.localize("LMRTFY.DemonLordNoCombat"));
        }

        game.settings.set("core", "rollMode", rollMode);

        target.disabled = true;
        this._checkClose();
    }

    _makeDemonLordCorruptionRoll() {
        const rollMode = game.settings.get("core", "rollMode");
        game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);

        for (let actor of this.actors) {
            Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));
			actor.rollCorruption();
            }

        game.settings.set("core", "rollMode", rollMode);

        this._disableButtons(target);
        this._checkClose();
    }

    async _makeDiceRoll(event, target, formula, defaultMessage = null) {
        if (formula.startsWith("1d20")) {
            if (this.advantage === 1)
                formula = formula.replace("1d20", "2d20kh1")
            else if (this.advantage === -1)
                formula = formula.replace("1d20", "2d20kl1")
        }

        const messageFlag = {"message": this.data.message, "data": this.data.attach};

        const rollMessages = [];
        const rollMessagePromises = this.actors.map(async (actor) => {
            const speaker = ChatMessage.getSpeaker({actor: actor});

            const rollData = actor.getRollData();
            const roll = new Roll(formula, rollData);
            const rollMessageData = await roll.toMessage(
                {"flags.lmrtfy": messageFlag},
                {rollMode: this.mode, create: false},
            );

            rollMessages.push(
                foundry.utils.mergeObject(
                    rollMessageData,
                    {
                        speaker: {
                            alias: speaker.alias,
                            scene: speaker.scene,
                            token: speaker.token,
                            actor: speaker.actor,
                        },
                        flavor: this.message || defaultMessage,
                        rollMode: this.mode,
                    },
                ),
            );
        })

        await Promise.allSettled(rollMessagePromises);
        await ChatMessage.create(rollMessages, {rollMode: this.mode});

        target.disabled = true;
        this._checkClose();
    }

    _drawTable(event, target, table) {
        const icons = {
            Actor: 'fas fa-user',
            Item: 'fas fa-suitcase',
            Scene: 'fas fa-map',
            JournalEntry: 'fas fa-book-open',
            Macro: 'fas fa-terminal',
            Playlist: '',
            Compendium: 'fas fa-atlas',
        }

        let chatMessages = [];
        let count = 0;
        const rollTable = game.tables.getName(table);

        if (rollTable) {
            for (let actor of this.actors) {
                rollTable.draw({ displayChat: false }).then((res) => {
                    count++;
                    const rollResults = res.results;

                    const nr = rollResults.length > 1 ? `${rollResults.length} results` : "a result";
                    let content = "";

                    for (const rollResult of rollResults) {
                        const result = rollResult;

                        if (!result.documentCollection) {
                            content += `<p>${result.text}</p>`;
                        } else if (['Actor', 'Item', 'Scene', 'JournalEntry', 'Macro'].includes(result.documentCollection)) {
                            content += `<p><a class="content-link" draggable="true" data-entity="${result.documentCollection}" data-uuid="${result.documentCollection}.${result.documentId}">
                                <i class="${icons[result.documentCollection]}"></i> ${result.text}</a></p>`;
                        } else if (result.documentCollection === 'Playlist') {
                            content += `<p>@${result.documentCollection}[${result.documentId}]{${result.text}}</p>`;
                        } else if (result.documentCollection) { // if not specific collection, then is compendium
                            content += `<p><a class="content-link" draggable="true" data-pack="${result.documentCollection}" data-uuid="${result.documentCollection}.${result.documentId}">
                                <i class="${icons[result.documentCollection]}"></i> ${result.text}</a></p>`;
                        }
                    }
                    let chatData = {
                        user: game.user.id,
                        speaker: ChatMessage.getSpeaker({actor}),
                        flavor: `Draws ${nr} from the ${table} table.`,
                        content: content,
                        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    };

                    if ( ["gmroll", "blindroll"].includes(this.mode) ) {
                        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                    }
                    if ( this.mode === "selfroll" ) chatData.whisper = [game.user.id];
                    if ( this.mode === "blindroll" ) chatData.blind = true;

                    foundry.utils.setProperty(chatData, "flags.lmrtfy", {"message": this.data.message, "data": this.data.attach, "blind": chatData.blind});

                    chatMessages.push(chatData);

                    if (count === this.actors.length) {
                        ChatMessage.create(chatMessages, {});

                        target.disabled = true;
                        this._checkClose();
                    }
                });
            }
        }
    }

    _onAbilityCheck(event, target) {
        event.preventDefault();
        const ability = target.dataset.ability;
        if (game.system.id === 'pf2e') this.pf2Roll = this.pf2eRollFor.ABILITY;

        // until patching has been removed
        if (!this.hasMidi || this.midiUseNewRoller) {
            this._makeRoll(event, target, LMRTFY.abilityRollMethod, false, ability);
        } else {
            this._makeRoll(event, target, LMRTFY.abilityRollMethod, ability);
        }
    }

    _onFailAbilityCheck(event, target) {
        event.preventDefault();
        const ability = target.dataset.ability;
        if (game.system.id === 'pf2e') this.pf2Roll = this.pf2eRollFor.ABILITY;

        // until patching has been removed
        if (!this.hasMidi || this.midiUseNewRoller) {
            this._makeRoll(event, target, LMRTFY.abilityRollMethod, true, ability);
        } else {
            this._makeRoll(event, target, LMRTFY.abilityRollMethod, ability);
        }
    }

    _onAbilitySave(event, target) {
        event.preventDefault();
        const saves = target.dataset.ability;
        if (game.system.id === 'pf2e') this.pf2Roll = this.pf2eRollFor.SAVE;

        // until patching has been removed
        if (!this.hasMidi || this.midiUseNewRoller) {
            this._makeRoll(event, target, LMRTFY.saveRollMethod, false, saves);
        } else {
            this._makeRoll(event, target, LMRTFY.saveRollMethod, saves);
        }
    }

    _onFailAbilitySave(event, target) {
        event.preventDefault();
        const saves = target.dataset.ability;
        if (game.system.id === 'pf2e') this.pf2Roll = this.pf2eRollFor.SAVE;

        // until patching has been removed
        if (!this.hasMidi || this.midiUseNewRoller) {
            this._makeRoll(event, target, LMRTFY.saveRollMethod, true, saves);
        } else {
            this._makeRoll(event, target, LMRTFY.saveRollMethod, saves);
        }
    }

    _onSkillCheck(event, target) {
        event.preventDefault();
        const skill = target.dataset.skill;
        if (game.system.id === 'pf2e') this.pf2Roll = this.pf2eRollFor.SKILL;

        // until patching has been removed
        if (!this.hasMidi || this.midiUseNewRoller) {
            this._makeRoll(event, target, LMRTFY.skillRollMethod, false, skill);
        } else {
            this._makeRoll(event, target, LMRTFY.skillRollMethod, skill);
        }
    }

    _onFailSkillCheck(event, target) {
        event.preventDefault();
        const skill = target.dataset.skill;
        if (game.system.id === 'pf2e') this.pf2Roll = this.pf2eRollFor.SKILL;

        // until patching has been removed
        if (!this.hasMidi || this.midiUseNewRoller) {
            this._makeRoll(event, target, LMRTFY.skillRollMethod, true, skill);
        } else {
            this._makeRoll(event, target, LMRTFY.skillRollMethod, skill);
        }
    }

    async _onCustomFormula(event, target) {
        event.preventDefault();
        await this._makeDiceRoll(event, target, this.data.formula);
    }

    _onInitiative(event, target) {
        event.preventDefault();

        switch (game.system.id) {
            case 'pf2e':
                this._makePF2EInitiativeRoll(event, target);
                break;
            case 'demonlord':
                this._makeDemonLordInitiativeRoll(event, target);
                break;
            default:
                if (this.data.initiative) {
                    for (let actor of this.actors) {
                        actor.rollInitiative();
                    }
                    target.disabled = true;
                    this._checkClose();
                } else {
                    let initiative = CONFIG.Combat.initiative.formula;
                    if (!initiative) {
                        console.warn("LMRTFY | No initiative formula found in CONFIG.Combat.initiative.formula, falling back to 1d20");
                        initiative = "1d20";
                    }
                    this._makeDiceRoll(event, target, initiative, game.i18n.localize("LMRTFY.InitiativeRollMessage"));
                }
                break;
        }
    }

    _onDeathSave(event, target) {
        event.preventDefault();
        switch (game.system.id) {
            case "dnd5e":
                for (let actor of this.actors) {
                    if (typeof actor.rollDeathSave === 'function') actor.rollDeathSave(event);
                }
                break
            case "pf2e":
                for (let actor of this.actors) {
                    if (typeof actor.rollRecovery === 'function') actor.rollRecovery();
                }
                break;
            case "demonlord":
                for (let actor of this.actors) {
                    this._makeDiceRoll(event, target, "1d6", game.i18n.localize("LMRTFY.DemonLordFateRoll"));
                }
                break;
            default:
                this._makeDiceRoll(event, target, "1d20", game.i18n.localize("LMRTFY.DeathSaveRollMessage"));
        }
        target.disabled = true;
        this._checkClose();
    }

    _onPerception(event, target) {
        event.preventDefault();
        if (game.system.id === 'demonlord')
            this._makeDemonLordCorruptionRoll()
        else
            this._makeDiceRoll(event, target, `1d20 + @attributes.perception.totalModifier`, game.i18n.localize("LMRTFY.PerceptionRollMessage"));
    }

    _onRollTable(event, target) {
        event.preventDefault();
        const table = target.dataset.table;
        this._drawTable(event, target, table);
    }

    _onToggleFailAbilityRoll(event, target) {
        event.preventDefault();
        if (target.classList.contains('disabled-button')) return;

        const failButton = document.querySelector(`.lmrtfy-ability-check-fail[data-ability *= '${target?.dataset?.ability}']`);
        if (failButton) failButton.disabled = !failButton.disabled;

        const normalButton = document.querySelector(`.lmrtfy-ability-check[data-ability *= '${target?.dataset?.ability}']`);
        if (normalButton) normalButton.disabled = !normalButton.disabled;
    }

    _onToggleFailSaveRoll(event, target) {
        event.preventDefault();
        if (target.classList.contains('disabled-button')) return;

        const failButton = document.querySelector(`.lmrtfy-ability-save-fail[data-ability *= '${target?.dataset?.ability}']`);
        if (failButton) failButton.disabled = !failButton.disabled;

        const normalButton = document.querySelector(`.lmrtfy-ability-save[data-ability *= '${target?.dataset?.ability}']`);
        if (normalButton) normalButton.disabled = !normalButton.disabled;
    }

    _onToggleFailSkillRoll(event, target) {
        event.preventDefault();
        if (target.classList.contains('disabled-button')) return;

        const failButton = document.querySelector(`.lmrtfy-skill-check-fail[data-skill *= '${target?.dataset?.skill}']`);
        if (failButton) failButton.disabled = !failButton.disabled;

        const normalButton = document.querySelector(`.lmrtfy-skill-check[data-ability *= '${target?.dataset?.ability}']`);
        if (normalButton) normalButton.disabled = !normalButton.disabled;
    }
}

globalThis.LMRTFYRoller = LMRTFYRoller;
