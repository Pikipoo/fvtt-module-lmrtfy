

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class LMRTFYRequestor extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        game.users.apps.push(this);

        this.selectedDice = [];
        this.selectedModifiers = [];
        this.dice = [
            'd3',
            'd4',
            'd6',
            'd8',
            'd10',
            'd12',
            'd20',
            'd100'
        ];

        this.diceFormula = '';
        this.bonusFormula = '';
        this.modifierFormula = '';

        if (game.settings.get('lmrtfy', 'enableParchmentTheme')) {
            this.options.classes.push('lmrtfy-parchment');
        }
    }

    static DEFAULT_OPTIONS = {
        id: "lmrtfy",
        classes: ["lmrtfy", "lmrtfy-requestor"],
        tag: "form",
        position: { width: 600, height: "auto" },
        window: { title: "LMRTFY.Title", resizable: true },
        form: {
            handler: LMRTFYRequestor.#onSubmitForm,
            closeOnSubmit: false,
            submitOnChange: false,
        },
        actions: {
            selectAll:             LMRTFYRequestor.prototype._onSelectAll,
            deselectAll:           LMRTFYRequestor.prototype._onDeselectAll,
            diceAdd:               LMRTFYRequestor.prototype._onDiceAdd,
            bonusAdjust:           LMRTFYRequestor.prototype._onBonusAdjust,
            clearFormula:          LMRTFYRequestor.prototype._onClearFormula,
        },
    };

    static get PARTS() {
        let template;
        switch (game.system.id) {
            case "degenesis":
                template = "modules/lmrtfy/templates/degenesis-request-rolls.html";
                break;
            case "demonlord":
                template = "modules/lmrtfy/templates/demonlord-request-rolls.html";
                break;
            case "wfrp4e":
                template = "modules/lmrtfy/templates/wfrp4e-request-rolls.html";
                break;
            default:
                template = "modules/lmrtfy/templates/request-rolls.html";
                break;
        }
        return { form: { template } };
    }

    async _prepareContext(options) {
        const actors = game.actors.contents;
        const users = game.users.contents;
        const abilities = LMRTFY.abilities;
        const saves = LMRTFY.saves;
        const abilityModifiers = LMRTFY.abilityModifiers;

        let skills;
        if (game.system.id === 'wfrp4e') {
            const skillNames = new Set();
            for (const actor of actors) {
                for (const item of (actor.itemTypes?.skill ?? [])) {
                    skillNames.add(item.name);
                }
            }
            skills = Array.from(skillNames).sort().reduce((acc, name) => {
                acc[name] = name;
                return acc;
            }, {});
        } else {
            skills = Object.keys(LMRTFY.skills)
                .sort((a, b) => {
                    const skillA = (LMRTFY.skills[a]?.label) ? LMRTFY.skills[a].label : LMRTFY.skills[a];
                    const skillB = (LMRTFY.skills[b]?.label) ? LMRTFY.skills[b].label : LMRTFY.skills[b];
                    return game.i18n.localize(skillA).localeCompare(game.i18n.localize(skillB));
                })
                .reduce((acc, skillKey) => {
                    const skill = (LMRTFY.skills[skillKey]?.label) ? LMRTFY.skills[skillKey]?.label : LMRTFY.skills[skillKey];
                    acc[skillKey] = skill;
                    return acc;
                }, {});
        }

        let difficultyOptions = [];
        if (game.system.id === 'wfrp4e' && LMRTFY.wfrp4eDifficultyLabels) {
            for (const [key, label] of Object.entries(LMRTFY.wfrp4eDifficultyLabels)) {
                difficultyOptions.push({ key, label, selected: key === 'challenging' });
            }
        }

        let tables = null;
        if (game.tables) {
            tables = [];
            game.tables.forEach(t => tables.push(t.name));
        }

        return {
            actors,
            users,
            abilities,
            saves,
            skills,
            tables,
            specialRolls: LMRTFY.specialRolls,
            rollModes: CONFIG.Dice.rollModes,
            showDC: (game.system.id === 'pf2e'),
            abilityModifiers,
            difficultyOptions,
        };
    }

    _onSelectAll(event, target) {
        this.element.querySelectorAll(".lmrtfy-actor input").forEach(el => el.checked = true);
    }

    _onDeselectAll(event, target) {
        this.element.querySelectorAll(".lmrtfy-actor input").forEach(el => el.checked = false);
    }

    _onDiceAdd(event, target) {
        this.selectedDice.push(target.dataset.value);
        this.diceFormula = this._convertSelectedDiceToFormula();
        this._combineFormula();
    }

    _onBonusAdjust(event, target) {
        let bonus = target.dataset.value;
        let newBonus = +(this.bonusFormula.trim().replace(' ', '')) + +bonus;
        if (newBonus === 0) {
            this.bonusFormula = '';
        } else {
            this.bonusFormula = ((newBonus > 0) ? ' + ' : ' - ') + Math.abs(newBonus).toString();
        }
        this._combineFormula();
    }

    _onToggleAbilityModifier(event, target) {
        if (target.checked) {
            this.selectedModifiers.push(target.dataset.value);
        } else {
            const index = this.selectedModifiers.indexOf(target.dataset.value);
            if (index > -1) this.selectedModifiers.splice(index, 1);
        }
        this.modifierFormula = this._convertSelectedModifiersToFormula();
        this._combineFormula();
    }

    _onClearFormula(event, target) {
        this.diceFormula = '';
        this.modifierFormula = '';
        this.bonusFormula = '';
        this.selectedDice = [];
        this.selectedModifiers = [];
        this.element.querySelectorAll(".lmrtfy-formula-ability").forEach(el => el.checked = false);
        this._combineFormula();
    }

    _getUserActorIds(userId) {
        let actors = [];
        if (userId === "character") {
            actors = game.users.contents.map(u => u.character?.id).filter(a => a);
        } else if (userId === "tokens") {
            actors = Array.from(new Set(canvas.tokens.controlled.map(t => t.actor.id))).filter(a => a);
        } else {
            const user = game.users.get(userId);
            if (user) {
                actors = game.actors.contents.filter(a => a.testUserPermission(user, "OWNER")).map(a => a.id);
            }
        }
        return actors;
    }

    _onUserChange() {
        const userId = this.element.querySelector("select[name=user]").value;
        const actors = this._getUserActorIds(userId);
        this.element.querySelectorAll(".lmrtfy-actor").forEach(el => {
            el.style.display = actors.includes(el.dataset.id) ? '' : 'none';
        });
        const requestBtn = this.element.querySelector(".lmrtfy-request-roll");
        if (requestBtn) {
            requestBtn.style.display = (userId === 'selected') ? 'none' : '';
        }
    }

    _onHoverActor(event) {
        const div = event.currentTarget;
        const tooltip = div.querySelector(".tooltip");
        if (tooltip) div.removeChild(tooltip);

        if (event.type === "mouseenter") {
            const userId = this.element.querySelector("select[name=user]").value;
            const actorId = div.dataset.id;
            const actor = game.actors.get(actorId);
            if (!actor) return;
            const user = userId === "character"
                ? game.users.contents.find(u => u.character && u.character.id === actor.id)
                : null;
            const tip = document.createElement("span");
            tip.classList.add("tooltip");
            tip.textContent = `${actor.name}${user ? ` (${user.name})` : ''}`;
            div.appendChild(tip);
        }
    }

    _diceRightClick(event) {
        event.preventDefault();
        const value = event.currentTarget.dataset.value;
        const index = this.selectedDice.indexOf(value);
        if (index > -1) {
            this.selectedDice.splice(index, 1);
        }
        this.diceFormula = this._convertSelectedDiceToFormula();
        this._combineFormula();
    }

    _convertSelectedDiceToFormula() {
        const occurences = (arr, val) => arr.reduce((a, v) => (v === val ? a + 1 : a), 0);
        let formula = '';
        if (!this.selectedDice?.length) return '';
        for (let die of this.dice) {
            let count = occurences(this.selectedDice, die);
            if (count > 0) {
                if (formula?.length) formula += ' + ';
                formula += count + die;
            }
        }
        return formula;
    }

    _convertSelectedModifiersToFormula() {
        let formula = '';
        if (!this.selectedModifiers?.length) return '';
        for (let mod of this.selectedModifiers) {
            if (formula?.length) formula += ' + ';
            formula += `@${mod}`;
        }
        return formula;
    }

    _combineFormula() {
        let customFormula = '';
        const input = this.element.querySelector(".custom-formula");
        if (this.diceFormula?.length) {
            customFormula += this.diceFormula;
            if (this.modifierFormula?.length) {
                customFormula += ` + ${this.modifierFormula}`;
            }
            if (this.bonusFormula?.length) {
                customFormula += this.bonusFormula;
            }
        } else if (input) {
            input.value = '';
        }
        if (customFormula?.length && input) {
            input.value = customFormula;
        }
    }

    _clearDemonLordSettings() {
        const advantage = this.element.querySelector("#advantage");
        const boonsBanes = this.element.querySelector("#boonsBanes");
        const additionalModifier = this.element.querySelector("#additionalModifier");
        if (!advantage || !boonsBanes || !additionalModifier) return;

        if (advantage.value === "-1" || advantage.value === "1") {
            boonsBanes.disabled = false;
            additionalModifier.disabled = false;
        } else {
            additionalModifier.value = "0";
            boonsBanes.value = "0";
            boonsBanes.disabled = true;
            additionalModifier.disabled = true;
        }
    }

    _onRender(context, options) {
        const userSelect = this.element.querySelector("select[name=user]");
        if (userSelect) {
            userSelect.addEventListener("change", () => this._onUserChange());
        }

        this.element.querySelectorAll(".lmrtfy-actor").forEach(el => {
            el.addEventListener("mouseenter", this._onHoverActor.bind(this));
            el.addEventListener("mouseleave", this._onHoverActor.bind(this));
        });

        this.element.querySelectorAll(".lmrtfy-dice-tray-button:not(.lmrtfy-bonus-button)").forEach(el => {
            el.addEventListener("contextmenu", this._diceRightClick.bind(this));
        });

        this.element.querySelectorAll(".lmrtfy-formula-ability").forEach(el => {
            el.addEventListener("change", (event) => this._onToggleAbilityModifier(event, event.currentTarget));
        });

        if (game.system.id === "demonlord") {
            const demonlordSelect = this.element.querySelector(".demonlord");
            if (demonlordSelect) {
                demonlordSelect.addEventListener("change", () => this._clearDemonLordSettings());
            }
        }

        this._onUserChange();
    }

    render(options = {}, _options = {}) {
        let force = false;
        let context = {};

        if (typeof options === "boolean") {
            force = options;
            context = _options;
        } else {
            force = options.force ?? false;
            context = options;
        }

        const { action, data } = context;
        if (action && !["create", "update", "delete"].includes(action)) return this;
        if (action === "update" && !data?.some(d => "character" in d)) return this;
        if (!force && !action) return this;

        return super.render(force ? { force: true } : {});
    }

    static async #onSubmitForm(event, form, formData) {
        const data = formData.object;
        const saveAsMacro = event.submitter?.classList.contains("lmrtfy-save-roll");
        const keys = Object.keys(data);
        const user_actors = this._getUserActorIds(data.user).map(id => `actor-${id}`);

        const actors = keys.filter(k => k.startsWith("actor-")).reduce((acc, k) => {
            if (data[k] && user_actors.includes(k))
                acc.push(k.slice(6));
            return acc;
        }, []);
        const abilities = keys.filter(k => k.startsWith("check-")).reduce((acc, k) => {
            if (data[k]) acc.push(k.slice(6));
            return acc;
        }, []);
        const saves = keys.filter(k => k.startsWith("save-")).reduce((acc, k) => {
            if (data[k]) acc.push(k.slice(5));
            return acc;
        }, []);
        const skills = keys.filter(k => k.startsWith("skill-")).reduce((acc, k) => {
            if (data[k]) acc.push(k.slice(6));
            return acc;
        }, []);
        const tables = data.table;
        const formula = (data.formula || '').trim();
        const { advantage, mode, title, message } = data;

        if (data.user === 'selected' && !saveAsMacro) {
            ui.notifications.warn(game.i18n.localize("LMRTFY.SelectedNotification"));
            return;
        }

        if ((actors.length === 0 && data.user !== 'selected') ||
            (
                !message &&
                abilities.length === 0 && saves.length === 0 && skills.length === 0 &&
                formula.length === 0 &&
                !data['extra-death-save'] && !data['extra-initiative'] && !data['extra-perception'] &&
                tables?.length === 0
            )
        ) {
            ui.notifications.warn(game.i18n.localize("LMRTFY.NothingNotification"));
            return;
        }

        let dc = undefined;
        if (game.system.id === 'pf2e') {
            if (Number.isInteger(parseInt(data.dc))) {
                dc = { value: parseInt(data.dc), visibility: data.visibility };
            }
        }

        let boonsBanes = undefined;
        let additionalModifier = undefined;
        if (game.system.id === 'demonlord') {
            boonsBanes = data.boonsBanes;
            additionalModifier = data.additionalModifier;
        }

        let difficulty = undefined;
        let slBonus = undefined;
        if (game.system.id === 'wfrp4e') {
            difficulty = data.difficulty;
            slBonus = parseInt(data.slBonus) || 0;
        }

        const socketData = {
            user: data.user,
            actors,
            abilities,
            saves,
            skills,
            advantage,
            mode,
            title,
            message,
            formula,
            deathsave: data['extra-death-save'],
            initiative: data['extra-initiative'],
            perception: data['extra-perception'],
            tables: tables,
            chooseOne: data['choose-one'],
            canFailChecks: LMRTFY.canFailChecks,
        };
        if (game.system.id === 'pf2e' && dc) socketData['dc'] = dc;
        if (game.system.id === 'demonlord') {
            socketData['boonsBanes'] = boonsBanes;
            socketData['additionalModifier'] = additionalModifier;
        }
        if (game.system.id === 'wfrp4e') {
            socketData['difficulty'] = difficulty;
            socketData['slBonus'] = slBonus;
        }

        if (saveAsMacro) {
            let selectedSection = '';
            if (socketData.user === 'selected') {
                selectedSection = `// Handle selected user\n` +
                    `if (data.user === "selected") {\n` +
                    `    if (!canvas.tokens?.controlled?.length) {\n` +
                    `      ui.notifications.warn(game.i18n.localize("LMRTFY.NoSelectedToken"));\n` +
                    `      return;\n` +
                    `    }\n\n` +
                    `    data.actors = canvas.tokens.controlled.map(t => t.actor.id);\n` +
                    `    data.user = "tokens";\n` +
                    `}\n\n`;
            }

            const actorTargets = actors.map(a => game.actors.get(a)).filter(a => a).map(a => a.name).join(", ");
            const user = game.users.get(data.user) || null;
            const target = user ? user.name : actorTargets;
            const scriptContent = `// ${title} ${message ? " -- " + message : ""}\n` +
                `// Request rolls from ${target}\n` +
                `// Abilities: ${abilities.map(a => LMRTFY.abilities[a]).filter(s => s).join(", ")}\n` +
                `// Saves: ${saves.map(a => LMRTFY.saves[a]).filter(s => s).join(", ")}\n` +
                `// Skills: ${skills.map(s => LMRTFY.skills[s]).filter(s => s).join(", ")}\n` +
                `const data = ${JSON.stringify(socketData, null, 2)};\n\n` +
                `${selectedSection}` +
                `game.socket.emit('module.lmrtfy', data);\n`;
            const macro = await Macro.create({
                name: "LMRTFY: " + (message || title),
                type: "script",
                scope: "global",
                command: scriptContent,
                img: "icons/svg/d20-highlight.svg"
            });
            macro.sheet.render(true);
        } else {
            game.socket.emit('module.lmrtfy', socketData);
            LMRTFY.onMessage(socketData);
            ui.notifications.info(game.i18n.localize("LMRTFY.SentNotification"));
        }
    }
}

globalThis.LMRTFYRequestor = LMRTFYRequestor;
