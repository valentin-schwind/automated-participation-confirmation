(function(window, $) {
    "use strict";

    var DEFAULT_SIGNATURE_PATH = "_img/whitePlaceholder.png";
    var SIGNATURE_EXAMPLE_PATH = "_img/signatureExample.png";
    var DEFAULT_SUPERVISOR_EMAIL = "schwind@hdm-stuttgart.de";

    var appState = {
        signatureDataUrl: DEFAULT_SIGNATURE_PATH,
        signatureReadyPromise: Promise.resolve(DEFAULT_SIGNATURE_PATH),
        currentModel: null,
        currentPdfHandle: null
    };

    var SELECT_OPTIONS = {
        institutions: [
            {
                label: "Frankfurt University of Applied Sciences",
                value: "frauas",
                affiliation: "Frankfurt University of Applied Sciences, Nibelungenplatz 1, 60318 Frankfurt am Main, Germany"
            },
            {
                label: "University of Regensburg",
                value: "regensburg",
                affiliation: "University of Regensburg, Universitaetsstr. 31, 93053 Regensburg, Germany"
            },
            {
                label: "Hochschule der Medien Stuttgart",
                value: "hdm",
                affiliation: "Hochschule der Medien Stuttgart, Nobelstr. 10, D-70569 Stuttgart, Germany"
            },
            {
                label: "University Bremen",
                value: "bremen",
                affiliation: "University Bremen, Bibliothekstrasse 1, 28359 Bremen, Germany"
            },
            {
                label: "Ludwig-Maximilians-Universitaet Muenchen",
                value: "lmu",
                affiliation: "Ludwig-Maximilians-Universitaet Muenchen, Frauenlobstr. 7a, 80337 Muenchen, Germany"
            },
            {
                label: "University of Stuttgart",
                value: "stuttgart",
                affiliation: "University of Stuttgart, Pfaffenwaldring 5a, 70569 Stuttgart, Germany"
            }
        ],
        researchTypes: [
            { label: "Please select", value: "" },
            { label: "Online study (survey, apps, downloads, etc.)", value: "online study" },
            { label: "User study (lab study, mixed reality, eye-tracking, etc.)", value: "user study" },
            { label: "Field study (outside the lab, workplaces, in-situ, etc.)", value: "field study" },
            { label: "Interview (focus groups, expert interviews, use cases, diaries, etc.)", value: "interview" }
        ],
        compensation: [
            { label: "Please select", value: "" },
            { label: "None", value: "no compensation" },
            { label: "1 EUR", value: "1 EUR" },
            { label: "5 EUR", value: "5 EUR" },
            { label: "10 EUR", value: "10 EUR" },
            { label: "15 EUR", value: "15 EUR" },
            { label: "20 EUR", value: "20 EUR" },
            { label: "1/2 credit point for the lecture", value: "one half credit point for the lecture MMI (Mensch-Maschine-Interaktion), HMI (Human-Machine-Interaction), or HCI (Human-Computer-Interaction)" },
            { label: "1 credit point for the lecture (e.g., when you need 3 for the lecture)", value: "one credit point for the lecture MMI (Mensch-Maschine-Interaktion), HMI (Human-Machine-Interaction), or HCI (Human-Computer-Interaction)" }
        ]
    };

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function populateSelect(selector, options, includeEmpty) {
        var element = $(selector);
        element.empty();

        if (includeEmpty) {
            element.append(new window.Option("Please select", ""));
        }

        options.forEach(function(option) {
            element.append(new window.Option(option.label, option.value));
        });
    }

    function getInstitution(value) {
        var selected = null;

        SELECT_OPTIONS.institutions.forEach(function(option) {
            if (option.value === value) {
                selected = option;
            }
        });

        return selected;
    }

    function readImagePathAsDataUrl(path) {
        return fetch(path)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error("Unable to load image.");
                }

                return response.blob();
            })
            .then(function(blob) {
                return new Promise(function(resolve, reject) {
                    var reader = new FileReader();
                    reader.onload = function(event) {
                        resolve(event.target.result);
                    };
                    reader.onerror = function() {
                        reject(new Error("Unable to read image."));
                    };
                    reader.readAsDataURL(blob);
                });
            });
    }

    function convertImageElementToDataUrl(path) {
        return new Promise(function(resolve, reject) {
            var image = new Image();
            image.onload = function() {
                try {
                    var canvas = document.createElement("canvas");
                    canvas.width = image.naturalWidth || image.width;
                    canvas.height = image.naturalHeight || image.height;
                    var context = canvas.getContext("2d");
                    context.drawImage(image, 0, 0);
                    resolve(canvas.toDataURL("image/png"));
                } catch (error) {
                    reject(error);
                }
            };
            image.onerror = function() {
                reject(new Error("Unable to load image element."));
            };
            image.src = path;
        });
    }

    function ensureSignatureDataUrl(value) {
        var source = String(value || "");

        if (!source || source === DEFAULT_SIGNATURE_PATH) {
            return Promise.resolve(DEFAULT_SIGNATURE_PATH);
        }

        if (source.indexOf("data:image/") === 0) {
            return Promise.resolve(source);
        }

        return readImagePathAsDataUrl(source).catch(function() {
            return convertImageElementToDataUrl(source);
        });
    }

    function normalizeCommaSeparated(value) {
        return String(value || "")
            .split(",")
            .map(function(entry) {
                return entry.trim();
            })
            .filter(Boolean);
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
    }

    function joinNames(values) {
        if (values.length === 0) {
            return "";
        }

        if (values.length === 1) {
            return values[0];
        }

        if (values.length === 2) {
            return values[0] + " and " + values[1];
        }

        return values.slice(0, -1).join(", ") + ", and " + values[values.length - 1];
    }

    function formatDateRange() {
        var picker = $("#daterangepicker").data("daterangepicker");
        return "from " + picker.startDate.format("DD/MM/YYYY") + " to " + picker.endDate.format("DD/MM/YYYY");
    }

    function normalizeParticipants(value) {
        var participants = normalizeCommaSeparated(value);

        if (!participants.length) {
            return [
                {
                    name: "",
                    displayName: "_______________________________________________________",
                    fileNameSuffix: "blank",
                    isBlank: true
                }
            ];
        }

        return participants.map(function(name) {
            return {
                name: name,
                displayName: name,
                fileNameSuffix: window.ParticipationConfirmationRenderer.sanitizeFilename(name),
                isBlank: false
            };
        });
    }

    function setManualInvalidState(selector, invalid) {
        $(selector).toggleClass("is-invalid-manual", Boolean(invalid));
    }

    function clearValidationState() {
        $("#participationForm").removeClass("was-validated");
        $(".is-invalid-manual").removeClass("is-invalid-manual");
        $("#formStatus").addClass("d-none").text("");
    }

    function showValidationMessage(message) {
        $("#formStatus").removeClass("d-none").text(message);
    }

    function getFormData() {
        var institution = getInstitution($("#selectInstitution").val());

        return {
            institution: institution,
            researchType: $("#selectResearch").val(),
            title: $("#title").val().trim(),
            compensation: $("#compensation").val(),
            dateRange: formatDateRange(),
            duration: $("#duration").val().trim(),
            teamMembers: normalizeCommaSeparated($("#teamMembers").val()),
            teamMemberEmails: normalizeCommaSeparated($("#teamMembersMails").val()),
            participants: normalizeParticipants($("#participants").val()),
            supervisorName: $("#supervisorName").val().trim(),
            supervisorMail: $("#supervisorMail").val().trim(),
            signatureDataUrl: appState.signatureDataUrl,
            hasSignature: appState.signatureDataUrl !== DEFAULT_SIGNATURE_PATH
        };
    }

    function setSignatureFromPath(path) {
        appState.signatureReadyPromise = ensureSignatureDataUrl(path)
            .then(function(dataUrl) {
                appState.signatureDataUrl = dataUrl;
                $("#previewImg").attr("src", dataUrl);
                return dataUrl;
            })
            .catch(function() {
                appState.signatureDataUrl = path;
                $("#previewImg").attr("src", path);
                return path;
            });

        return appState.signatureReadyPromise;
    }

    function validateForm(data) {
        clearValidationState();
        var form = $("#participationForm")[0];
        $("#participationForm").addClass("was-validated");

        if (!form.checkValidity()) {
            return false;
        }

        if (!data.institution) {
            setManualInvalidState("#selectInstitution", true);
            showValidationMessage("Please select an institution.");
            return false;
        }

        if (data.teamMembers.length !== data.teamMemberEmails.length) {
            setManualInvalidState("#teamMembers, #teamMembersMails", true);
            showValidationMessage("Number of group members and their e-mails must be identical.");
            return false;
        }

        if (!data.teamMemberEmails.every(isValidEmail)) {
            setManualInvalidState("#teamMembersMails", true);
            showValidationMessage("Please enter valid comma-separated researcher e-mail addresses.");
            return false;
        }

        if (!isValidEmail(data.supervisorMail)) {
            setManualInvalidState("#supervisorMail", true);
            showValidationMessage("Please enter a valid supervisor e-mail address.");
            return false;
        }

        return true;
    }

    function createModel(data) {
        var teamLabel = data.teamMembers.length > 1 ? "we" : "I";
        var ownershipLabel = data.teamMembers.length > 1 ? "our" : "my";
        var contactLabel = data.teamMembers.length > 1 ? "us" : "me";
        var thanksLabel = data.teamMembers.length > 1 ? "We are" : "I am";

        return {
            fileName: "Confirmation of Participation.pdf",
            affiliationLines: data.institution.affiliation,
            participants: data.participants.map(function(participant) {
                return {
                    displayName: participant.displayName,
                    fileNameSuffix: participant.fileNameSuffix,
                    isBlank: participant.isBlank,
                    hasSignature: data.hasSignature,
                    signatureDataUrl: data.signatureDataUrl,
                    signatureLabel: data.teamMembers.length > 1 ? "Signatures of the experimenters" : "Signature of the experimenter"
                };
            }),
            openingLine: "With this letter " + teamLabel + ", " + joinNames(data.teamMembers) + ", hereby confirm that",
            participationLine: "participated in " + ownershipLabel + " " + data.researchType + " \"" + data.title + "\". The " + data.researchType + " occurred in the period " + data.dateRange + " and lasted around " + data.duration + ". The research is supervised by " + data.supervisorName + " (" + data.supervisorMail + ") at " + data.institution.label + ".",
            compensationLine: "The participation is rewarded with " + data.compensation + ".",
            rulesLine: "Repeated participation in the study is not permitted. Subsequent changes of the compensation are not allowed. The regulations of participation of the informed consent apply.",
            supervisorLine: "The supervisor and head of the investigation, " + data.supervisorName + " (" + data.supervisorMail + "), is available to answer questions regarding the process and scope of this research.",
            contactIntroLine: "In case of any questions regarding the details of the " + data.researchType + ", you can contact " + contactLabel + ":",
            contactLines: data.teamMembers.map(function(name, index) {
                return name + " (" + data.teamMemberEmails[index] + ")";
            }),
            thanksLine: thanksLabel + " thankful for your support of " + ownershipLabel + " research."
        };
    }

    function renderHtmlPreview(model, data) {
        var html = model.participants.map(function(participant) {
            return [
                '<section class="letter-sheet">',
                '<div class="letter-header">',
                '<div class="letter-affiliation">' + escapeHtml(model.affiliationLines) + '</div>',
                '<img class="letter-logo" src="_img/hdmlogo.png" alt="HdM logo" />',
                '</div>',
                '<h2 class="letter-title">Confirmation of Participation</h2>',
                '<p>' + escapeHtml(model.openingLine) + '</p>',
                '<div class="participant-name' + (participant.isBlank ? ' is-blank' : '') + '">' + escapeHtml(participant.displayName) + '</div>',
                '<p>' + escapeHtml(model.participationLine) + '</p>',
                '<p>' + escapeHtml(model.compensationLine) + '</p>',
                '<p>' + escapeHtml(model.rulesLine) + '</p>',
                '<p>' + escapeHtml(model.supervisorLine) + '</p>',
                '<p>' + escapeHtml(model.contactIntroLine) + '</p>',
                '<ul class="contact-list">',
                model.contactLines.map(function(line) {
                    return '<li>' + escapeHtml(line) + '</li>';
                }).join(''),
                '</ul>',
                '<p>' + escapeHtml(model.thanksLine) + '</p>',
                '<div class="signature-block">',
                data.hasSignature ? '<img class="signature-image" src="' + escapeHtml(data.signatureDataUrl) + '" alt="Signature" />' : '',
                '<div class="signature-line"></div>',
                '<div class="signature-label">' + escapeHtml(participant.signatureLabel) + '</div>',
                '</div>',
                '</section>'
            ].join('');
        }).join('');

        $("#previewHTML").html('<div class="preview-document">' + html + '</div>');
    }

    function renderPreview(data) {
        var model = createModel(data);
        appState.currentModel = model;
        renderHtmlPreview(model, data);
        appState.currentPdfHandle = window.ParticipationConfirmationRenderer.renderPdfPreview(model, "#previewPDF", model.fileName);
        $("#dversion").text("PDF preview ready");
        $("#input").addClass("d-none");
        $("#resultsView").removeClass("d-none");
    }

    function resetToForm() {
        $("#resultsView").addClass("d-none");
        $("#input").removeClass("d-none");
        $("#dversion").text("");
        $("#previewPDF").empty();
        $("#previewHTML").empty();
        appState.currentModel = null;
        appState.currentPdfHandle = null;
    }

    function buildSingleParticipantModel(baseModel, participant) {
        return {
            fileName: "Confirmation of Participation - " + participant.fileNameSuffix + ".pdf",
            affiliationLines: baseModel.affiliationLines,
            participants: [participant],
            openingLine: baseModel.openingLine,
            participationLine: baseModel.participationLine,
            compensationLine: baseModel.compensationLine,
            rulesLine: baseModel.rulesLine,
            supervisorLine: baseModel.supervisorLine,
            contactIntroLine: baseModel.contactIntroLine,
            contactLines: baseModel.contactLines,
            thanksLine: baseModel.thanksLine
        };
    }

    function saveCombinedPdf() {
        if (!appState.currentPdfHandle) {
            return;
        }

        appState.currentPdfHandle.save("Confirmation of Participation.pdf");
    }

    function saveEachParticipantPdf() {
        if (!appState.currentModel) {
            return;
        }

        appState.currentModel.participants.forEach(function(participant) {
            var singleModel = buildSingleParticipantModel(appState.currentModel, participant);
            var handle = window.ParticipationConfirmationRenderer.createPdf(singleModel, singleModel.fileName);
            handle.save(singleModel.fileName);
        });
    }

    function printAll() {
        var iframe = $("#previewPDF iframe").get(0);

        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            return;
        }

        window.print();
    }

    function applyExample(includeSignature) {
        $("#selectInstitution").val("hdm");
        $("#selectResearch").val("user study");
        $("#title").val("Fitts' Task in Virtual Reality using Avatar Hands");
        $("#compensation").val("one credit point for the lecture MMI (Mensch-Maschine-Interaktion), HMI (Human-Machine-Interaction), or HCI (Human-Computer-Interaction)");
        $("#duration").val("60 minutes");
        $("#supervisorName").val("Prof. Dr. Valentin Schwind");
        $("#supervisorMail").val(DEFAULT_SUPERVISOR_EMAIL);

        if (includeSignature) {
            $("#teamMembers").val("Max Mustermann, Maxy Musterfrau, Susi Musterfrau");
            $("#teamMembersMails").val("max.mustermann@hdm-stuttgart.de, maxy.musterfrau@hdm-stuttgart.de, susi.musterfrau@hdm-stuttgart.de");
            $("#participants").val("Hans Wurst, Heide Kraut, Franz Mann");
            void setSignatureFromPath(SIGNATURE_EXAMPLE_PATH);
        } else {
            $("#teamMembers").val("Max Mustermann");
            $("#teamMembersMails").val("max.mustermann@hdm-stuttgart.de");
            $("#participants").val("Rosa Himmel, Roman Tisch, Rainer Zufall");
            appState.signatureDataUrl = DEFAULT_SIGNATURE_PATH;
            appState.signatureReadyPromise = Promise.resolve(DEFAULT_SIGNATURE_PATH);
            $("#signatureUpload").val("");
        }

        if (!includeSignature) {
            $("#previewImg").attr("src", appState.signatureDataUrl);
        }
    }

    function handleSignatureUpload(event) {
        var file = event.target.files && event.target.files[0];

        if (!file) {
            return;
        }

        var reader = new FileReader();
        reader.onload = function(loadEvent) {
            appState.signatureDataUrl = loadEvent.target.result;
            appState.signatureReadyPromise = Promise.resolve(loadEvent.target.result);
            $("#previewImg").attr("src", appState.signatureDataUrl);
        };
        reader.readAsDataURL(file);
    }

    function initializeDateRange() {
        $("#daterangepicker").daterangepicker({
            opens: "right",
            autoApply: true,
            startDate: moment().subtract(7, "days"),
            endDate: moment(),
            locale: {
                format: "DD.MM.YYYY"
            }
        });
    }

    function applyPlaceholders() {
        $("#title").attr("placeholder", "Your research title");
        $("#duration").attr("placeholder", "e.g., 60 minutes");
        $("#teamMembers").attr("placeholder", "Eva Musterfrau, Max Mustermann");
        $("#teamMembersMails").attr("placeholder", "eva.musterfrau@hdm-stuttgart.de, max.mustermann@hdm-stuttgart.de");
        $("#participants").attr("placeholder", "Hans Wurst, Heide Kraut, Franz Mann");
        $("#supervisorName").attr("placeholder", "The person who supervises this study");
        $("#supervisorMail").attr("placeholder", DEFAULT_SUPERVISOR_EMAIL);
    }

    function bindEvents() {
        $("#btnExample").on("click", function() {
            applyExample(true);
        });

        $("#btnExampleWithoutSignature").on("click", function() {
            applyExample(false);
        });

        $("#btnBack").on("click", resetToForm);
        $("#btnSave").on("click", saveCombinedPdf);
        $("#btnSaveEach").on("click", saveEachParticipantPdf);
        $("#btnPrint").on("click", printAll);
        $("#signatureUpload").on("change", handleSignatureUpload);
        $("#participationForm").on("submit", async function(event) {
            event.preventDefault();
            appState.signatureDataUrl = await ensureSignatureDataUrl(appState.signatureDataUrl).catch(function() {
                return appState.signatureDataUrl;
            });
            await appState.signatureReadyPromise;
            var data = getFormData();

            if (!validateForm(data)) {
                return;
            }

            renderPreview(data);
        });
    }

    function init() {
        populateSelect("#selectInstitution", SELECT_OPTIONS.institutions, false);
        populateSelect("#selectResearch", SELECT_OPTIONS.researchTypes, false);
        populateSelect("#compensation", SELECT_OPTIONS.compensation, false);
        initializeDateRange();
        applyPlaceholders();
        bindEvents();
        $("#selectInstitution").val("hdm");
        $("#supervisorMail").val(DEFAULT_SUPERVISOR_EMAIL);
        $("#previewImg").attr("src", DEFAULT_SIGNATURE_PATH);
    }

    $(init);
})(window, jQuery);
