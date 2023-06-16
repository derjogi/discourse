import Controller from "@ember/controller";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { ajax } from "discourse/lib/ajax";
import { isEmpty } from "@ember/utils";
import { extractError } from "discourse/lib/ajax-error";
import { inject as service } from "@ember/service";
import I18n from "I18n";
import { sanitize } from "discourse/lib/text";
import { tracked } from "@glimmer/tracking";
import { A } from "@ember/array";
import { SIDEBAR_SECTION, SIDEBAR_URL } from "discourse/lib/constants";
import { bind } from "discourse-common/utils/decorators";

const FULL_RELOAD_LINKS_REGEX = [
  /^\/my\/[a-z_\-\/]+$/,
  /^\/pub\/[a-z_\-\/]+$/,
  /^\/safe-mode$/,
];

class Section {
  @tracked title;
  @tracked links;
  @tracked secondaryLinks;

  constructor({
    title,
    links,
    secondaryLinks,
    id,
    publicSection,
    sectionType,
  }) {
    this.title = title;
    this.public = publicSection;
    this.sectionType = sectionType;
    this.links = links;
    this.secondaryLinks = secondaryLinks;
    this.id = id;
  }

  get valid() {
    const allLinks = this.links
      .filter((link) => !link._destroy)
      .concat(this.secondaryLinks?.filter((link) => !link._destroy) || []);
    const validLinks =
      allLinks.length > 0 && allLinks.every((link) => link.valid);
    return this.validTitle && validLinks;
  }

  get validTitle() {
    return !this.#blankTitle && !this.#tooLongTitle;
  }

  get invalidTitleMessage() {
    if (this.title === undefined) {
      return;
    }
    if (this.#blankTitle) {
      return I18n.t("sidebar.sections.custom.title.validation.blank");
    }
    if (this.#tooLongTitle) {
      return I18n.t("sidebar.sections.custom.title.validation.maximum", {
        count: SIDEBAR_SECTION.max_title_length,
      });
    }
  }

  get titleCssClass() {
    return this.title === undefined || this.validTitle ? "" : "warning";
  }

  get #blankTitle() {
    return isEmpty(this.title);
  }

  get #tooLongTitle() {
    return this.title.length > SIDEBAR_SECTION.max_title_length;
  }
}

class SectionLink {
  @tracked icon;
  @tracked name;
  @tracked value;
  @tracked _destroy;

  constructor({ router, icon, name, value, id, objectId, segment }) {
    this.router = router;
    this.icon = icon || "link";
    this.name = name;
    this.value = value;
    this.id = id;
    this.httpHost = "http://" + window.location.host;
    this.httpsHost = "https://" + window.location.host;
    this.objectId = objectId;
    this.segment = segment;
  }

  get path() {
    return this.value?.replace(this.httpHost, "").replace(this.httpsHost, "");
  }

  get valid() {
    return this.validIcon && this.validName && this.validValue;
  }

  get validIcon() {
    return !this.#blankIcon && !this.#tooLongIcon;
  }

  get validName() {
    return !this.#blankName && !this.#tooLongName;
  }

  get validValue() {
    return !this.#blankValue && !this.#tooLongValue && !this.#invalidValue;
  }

  get invalidIconMessage() {
    if (this.#blankIcon) {
      return I18n.t("sidebar.sections.custom.links.icon.validation.blank");
    }
    if (this.#tooLongIcon) {
      return I18n.t("sidebar.sections.custom.links.icon.validation.maximum", {
        count: SIDEBAR_URL.max_icon_length,
      });
    }
  }

  get invalidNameMessage() {
    if (this.name === undefined) {
      return;
    }
    if (this.#blankName) {
      return I18n.t("sidebar.sections.custom.links.name.validation.blank");
    }
    if (this.#tooLongName) {
      return I18n.t("sidebar.sections.custom.links.name.validation.maximum", {
        count: SIDEBAR_URL.max_name_length,
      });
    }
  }

  get invalidValueMessage() {
    if (this.value === undefined) {
      return;
    }
    if (this.#blankValue) {
      return I18n.t("sidebar.sections.custom.links.value.validation.blank");
    }
    if (this.#tooLongValue) {
      return I18n.t("sidebar.sections.custom.links.value.validation.maximum", {
        count: SIDEBAR_URL.max_value_length,
      });
    }
    if (this.#invalidValue) {
      return I18n.t("sidebar.sections.custom.links.value.validation.invalid");
    }
  }

  get iconCssClass() {
    return this.icon === undefined || this.validIcon ? "" : "warning";
  }

  get nameCssClass() {
    return this.name === undefined || this.validName ? "" : "warning";
  }

  get valueCssClass() {
    return this.value === undefined || this.validValue ? "" : "warning";
  }

  get external() {
    return (
      this.value &&
      !(
        this.value.startsWith(this.httpHost) ||
        this.value.startsWith(this.httpsHost) ||
        this.value.startsWith("/")
      )
    );
  }

  get isPrimary() {
    return this.segment === "primary";
  }

  get #blankIcon() {
    return isEmpty(this.icon);
  }

  get #tooLongIcon() {
    return this.icon.length > SIDEBAR_URL.max_icon_length;
  }

  get #blankName() {
    return isEmpty(this.name);
  }

  get #tooLongName() {
    return this.name.length > SIDEBAR_URL.max_name_length;
  }

  get #blankValue() {
    return isEmpty(this.value);
  }

  get #tooLongValue() {
    return this.value.length > SIDEBAR_URL.max_value_length;
  }

  get #invalidValue() {
    return (
      this.path &&
      (this.external ? !this.#validExternal() : !this.#validInternal())
    );
  }

  #validExternal() {
    try {
      return new URL(this.value);
    } catch {
      return false;
    }
  }

  #validInternal() {
    return (
      this.router.recognize(this.path).name !== "unknown" ||
      FULL_RELOAD_LINKS_REGEX.some((regex) => this.path.match(regex))
    );
  }
}

export default Controller.extend(ModalFunctionality, {
  dialog: service(),
  router: service(),

  onShow() {
    this.setProperties({
      flashText: null,
      flashClass: null,
    });
    this.nextObjectId = 0;
    this.model = this.initModel();
  },

  onClose() {
    this.model = null;
  },

  initModel() {
    if (this.model) {
      return new Section({
        title: this.model.title,
        publicSection: this.model.public,
        sectionType: this.model.section_type,
        links: this.model.links.reduce((acc, link) => {
          if (link.segment === "primary") {
            this.nextObjectId++;
            acc.push(this.initLink(link));
          }
          return acc;
        }, A()),
        secondaryLinks: this.model.links.reduce((acc, link) => {
          if (link.segment === "secondary") {
            this.nextObjectId++;
            acc.push(this.initLink(link));
          }
          return acc;
        }, A()),
        id: this.model.id,
      });
    } else {
      return new Section({
        links: A([
          new SectionLink({
            router: this.router,
            objectId: this.nextObjectId,
            segment: "primary",
          }),
        ]),
      });
    }
  },

  initLink(link) {
    return new SectionLink({
      router: this.router,
      icon: link.icon,
      name: link.name,
      value: link.value,
      id: link.id,
      objectId: this.nextObjectId,
      segment: link.segment,
    });
  },

  create() {
    return ajax(`/sidebar_sections`, {
      type: "POST",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify({
        title: this.model.title,
        public: this.model.public,
        links: this.model.links.map((link) => {
          return {
            icon: link.icon,
            name: link.name,
            value: link.path,
          };
        }),
      }),
    })
      .then((data) => {
        this.currentUser.set(
          "sidebar_sections",
          this.currentUser.sidebar_sections.concat(data.sidebar_section)
        );
        this.send("closeModal");
      })
      .catch((e) =>
        this.setProperties({
          flashText: sanitize(extractError(e)),
          flashClass: "error",
        })
      );
  },

  update() {
    return ajax(`/sidebar_sections/${this.model.id}`, {
      type: "PUT",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify({
        title: this.model.title,
        public: this.model.public,
        links: this.model.links
          .concat(this.model?.secondaryLinks || [])
          .map((link) => {
            return {
              id: link.id,
              icon: link.icon,
              name: link.name,
              value: link.path,
              segment: link.segment,
              _destroy: link._destroy,
            };
          }),
      }),
    })
      .then((data) => {
        const newSidebarSections = this.currentUser.sidebar_sections.map(
          (section) => {
            if (section.id === data["sidebar_section"].id) {
              return data["sidebar_section"];
            }
            return section;
          }
        );
        this.currentUser.set("sidebar_sections", newSidebarSections);
        this.send("closeModal");
      })
      .catch((e) =>
        this.setProperties({
          flashText: sanitize(extractError(e)),
          flashClass: "error",
        })
      );
  },

  get activeLinks() {
    return this.model.links.filter((link) => !link._destroy);
  },

  get activeSecondaryLinks() {
    return this.model.secondaryLinks?.filter((link) => !link._destroy);
  },

  get header() {
    return this.model.id
      ? "sidebar.sections.custom.edit"
      : "sidebar.sections.custom.add";
  },

  @bind
  reorder(linkFromId, linkTo, above) {
    if (linkFromId === linkTo.objectId) {
      return;
    }
    let linkFrom = this.model.links.find(
      (link) => link.objectId === linkFromId
    );
    if (!linkFrom) {
      linkFrom = this.model.secondaryLinks.find(
        (link) => link.objectId === linkFromId
      );
    }

    if (linkFrom.isPrimary) {
      this.model.links.removeObject(linkFrom);
    } else {
      this.model.secondaryLinks?.removeObject(linkFrom);
    }

    if (linkTo.isPrimary) {
      const toPosition = this.model.links.indexOf(linkTo);
      linkFrom.segment = "primary";
      this.model.links.insertAt(above ? toPosition : toPosition + 1, linkFrom);
    } else {
      linkFrom.segment = "secondary";
      const toPosition = this.model.secondaryLinks.indexOf(linkTo);
      this.model.secondaryLinks.insertAt(
        above ? toPosition : toPosition + 1,
        linkFrom
      );
    }
  },

  get canDelete() {
    return this.model.id && !this.model.sectionType;
  },

  @bind
  deleteLink(link) {
    if (link.id) {
      link._destroy = "1";
    } else {
      if (link.isPrimary) {
        this.model.links.removeObject(link);
      } else {
        this.model.secondaryLinks.removeObject(link);
      }
    }
  },

  actions: {
    addLink() {
      this.nextObjectId = this.nextObjectId + 1;
      this.model.links.pushObject(
        new SectionLink({
          router: this.router,
          objectId: this.nextObjectId,
          segment: "primary",
        })
      );
    },

    addSecondaryLink() {
      this.nextObjectId = this.nextObjectId + 1;
      this.model.secondaryLinks.pushObject(
        new SectionLink({
          router: this.router,
          objectId: this.nextObjectId,
          segment: "secondary",
        })
      );
    },

    resetToDefault() {
      return this.dialog.yesNoConfirm({
        message: I18n.t("sidebar.sections.custom.reset_confirm"),
        didConfirm: () => {
          return ajax(`/sidebar_sections/reset/${this.model.id}`, {
            type: "PUT",
          })
            .then((data) => {
              this.currentUser.sidebar_sections.shiftObject();
              this.currentUser.sidebar_sections.unshiftObject(
                data["sidebar_section"]
              );
              this.send("closeModal");
            })
            .catch((e) =>
              this.setProperties({
                flashText: sanitize(extractError(e)),
                flashClass: "error",
              })
            );
        },
      });
    },

    save() {
      this.model.id ? this.update() : this.create();
    },

    delete() {
      return this.dialog.yesNoConfirm({
        message: I18n.t("sidebar.sections.custom.delete_confirm"),
        didConfirm: () => {
          return ajax(`/sidebar_sections/${this.model.id}`, {
            type: "DELETE",
          })
            .then(() => {
              const newSidebarSections =
                this.currentUser.sidebar_sections.filter((section) => {
                  return section.id !== this.model.id;
                });

              this.currentUser.set("sidebar_sections", newSidebarSections);
              this.send("closeModal");
            })
            .catch((e) =>
              this.setProperties({
                flashText: sanitize(extractError(e)),
                flashClass: "error",
              })
            );
        },
      });
    },
  },
});
