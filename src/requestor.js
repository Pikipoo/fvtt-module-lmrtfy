

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
            toggleAbilityModifier: LMRTFYRequestor.prototype._onToggleAbilityModifier,
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

    static async #onSubmitForm(event, form, formData) {
        // Filled in checkpoint 4.
    }

    // Subsequent checkpoints add: _prepareContext, action/helper methods, _onRender,
    // render(options) override, and the real body of #onSubmitForm.
}

