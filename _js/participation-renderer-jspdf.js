(function(window) {
    "use strict";

    var PAGE_WIDTH_MM = 210;
    var PAGE_HEIGHT_MM = 297;
    var MARGIN_TOP_MM = 22;
    var MARGIN_RIGHT_MM = 16;
    var MARGIN_BOTTOM_MM = 18;
    var MARGIN_LEFT_MM = 16;
    var CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM;
    var MM_PER_PT = 0.352777778;
    var BODY_FONT_SIZE_PT = 10;
    var TITLE_FONT_SIZE_PT = 16;
    var HEADER_FONT_SIZE_PT = 8;
    var LINE_HEIGHT_MULTIPLIER = 1.25;

    function getJsPdfCtor() {
        if (window.jspdf && window.jspdf.jsPDF) {
            return window.jspdf.jsPDF;
        }

        if (window.jsPDF) {
            return window.jsPDF;
        }

        throw new Error("jsPDF is not loaded.");
    }

    function getFontRegistrationScript(variableName) {
        if (!variableName || typeof window[variableName] !== "string") {
            return "";
        }

        return window[variableName];
    }

    function registerFontScript(doc, scriptSource) {
        if (!scriptSource) {
            return;
        }

        var registerFont = new Function("doc", scriptSource);
        registerFont(doc);
    }

    function ensureRobotoFonts(doc) {
        var fontList = typeof doc.getFontList === "function" ? doc.getFontList() : {};
        var hasRegular = Array.isArray(fontList["Roboto-Regular"]) && fontList["Roboto-Regular"].indexOf("normal") !== -1;
        var hasMedium = Array.isArray(fontList["Roboto-Medium"]) && fontList["Roboto-Medium"].indexOf("normal") !== -1;

        if (!hasRegular) {
            registerFontScript(doc, getFontRegistrationScript("includeRobotoFontNormal"));
        }

        if (!hasMedium) {
            registerFontScript(doc, getFontRegistrationScript("includeRobotoFontMedium"));
        }
    }

    function ptToMm(pt) {
        return pt * MM_PER_PT;
    }

    function getLineHeightMm(fontSizePt) {
        return ptToMm(fontSizePt) * LINE_HEIGHT_MULTIPLIER;
    }

    function sanitizeFilename(value) {
        return String(value || "blank")
            .replace(/[\\/:*?"<>|]/g, "-")
            .replace(/\s+/g, " ")
            .trim() || "blank";
    }

    function createPdf(model, filename) {
        var JsPdfCtor = getJsPdfCtor();
        var doc = new JsPdfCtor({
            unit: "mm",
            format: "a4",
            orientation: "portrait"
        });

        ensureRobotoFonts(doc);

        var currentY = MARGIN_TOP_MM;
        var totalPages = model.participants.length;

        function setRegularFont(sizePt) {
            doc.setFont("Roboto-Regular", "normal");
            doc.setFontSize(sizePt);
            doc.setTextColor(17, 24, 39);
        }

        function setMediumFont(sizePt) {
            doc.setFont("Roboto-Medium", "normal");
            doc.setFontSize(sizePt);
            doc.setTextColor(17, 24, 39);
        }

        function ensureSpace(requiredHeightMm) {
            if (currentY + requiredHeightMm <= PAGE_HEIGHT_MM - MARGIN_BOTTOM_MM) {
                return;
            }

            doc.addPage();
            currentY = MARGIN_TOP_MM;
        }

        function addWrappedText(text, options) {
            var value = String(text || "").trim();
            var config = options || {};

            if (!value) {
                return;
            }

            if (config.medium) {
                setMediumFont(config.fontSizePt || BODY_FONT_SIZE_PT);
            } else {
                setRegularFont(config.fontSizePt || BODY_FONT_SIZE_PT);
            }

            var lineHeight = getLineHeightMm(config.fontSizePt || BODY_FONT_SIZE_PT);
            var width = config.width || CONTENT_WIDTH_MM;
            var lines = doc.splitTextToSize(value, width);
            var blockHeight = lines.length * lineHeight;

            ensureSpace(blockHeight + (config.marginBottomMm || 0));
            doc.text(lines, config.x || MARGIN_LEFT_MM, currentY, { align: config.align || "left" });
            currentY += blockHeight + (config.marginBottomMm || 0);
        }

        function addList(items) {
            var entries = Array.isArray(items) ? items : [];

            entries.forEach(function(item) {
                addWrappedText("- " + item, { marginBottomMm: 1.6 });
            });

            currentY += 1.4;
        }

        function addSignatureBlock(participant) {
            ensureSpace(36);

            if (participant.hasSignature && participant.signatureDataUrl) {
                try {
                    var pngProperties = doc.getImageProperties(participant.signatureDataUrl);
                    var pngAspectRatio = pngProperties.width / pngProperties.height;
                    var targetHeight = 13;
                    var targetWidth = targetHeight * pngAspectRatio;
                    var maxWidth = 64;

                    if (targetWidth > maxWidth) {
                        targetWidth = maxWidth;
                        targetHeight = targetWidth / pngAspectRatio;
                    }

                    doc.addImage(participant.signatureDataUrl, "PNG", MARGIN_LEFT_MM, currentY, targetWidth, targetHeight);
                } catch (error) {
                    try {
                        var jpegProperties = doc.getImageProperties(participant.signatureDataUrl);
                        var jpegAspectRatio = jpegProperties.width / jpegProperties.height;
                        var jpegTargetHeight = 13;
                        var jpegTargetWidth = jpegTargetHeight * jpegAspectRatio;
                        var jpegMaxWidth = 64;

                        if (jpegTargetWidth > jpegMaxWidth) {
                            jpegTargetWidth = jpegMaxWidth;
                            jpegTargetHeight = jpegTargetWidth / jpegAspectRatio;
                        }

                        doc.addImage(participant.signatureDataUrl, "JPEG", MARGIN_LEFT_MM, currentY, jpegTargetWidth, jpegTargetHeight);
                    } catch (fallbackError) {
                    }
                }
            }

            currentY += 17;
            doc.setDrawColor(17, 24, 39);
            doc.line(MARGIN_LEFT_MM, currentY, MARGIN_LEFT_MM + 64, currentY);
            currentY += 5;
            addWrappedText(participant.signatureLabel, { marginBottomMm: 0 });
        }

        function renderHeader(pageNumber) {
            setRegularFont(HEADER_FONT_SIZE_PT);
            doc.setTextColor(71, 85, 105);
            doc.text(model.affiliationLines, MARGIN_LEFT_MM, 12.5);
            doc.text("Page " + pageNumber + "/" + totalPages, PAGE_WIDTH_MM - MARGIN_RIGHT_MM, 12.5, { align: "right" });
            currentY = 28;
        }

        model.participants.forEach(function(participant, index) {
            if (index > 0) {
                doc.addPage();
            }

            renderHeader(index + 1);

            addWrappedText("Confirmation of Participation", {
                medium: true,
                fontSizePt: TITLE_FONT_SIZE_PT,
                marginBottomMm: 6
            });

            addWrappedText(model.openingLine, { marginBottomMm: 2.5 });
            addWrappedText(participant.displayName, {
                medium: !participant.isBlank,
                fontSizePt: 12,
                align: "center",
                x: PAGE_WIDTH_MM / 2,
                marginBottomMm: 4
            });
            addWrappedText(model.participationLine, { marginBottomMm: 3 });
            addWrappedText(model.compensationLine, { marginBottomMm: 3 });
            addWrappedText(model.rulesLine, { marginBottomMm: 3 });
            addWrappedText(model.supervisorLine, { marginBottomMm: 3 });
            addWrappedText(model.contactIntroLine, { marginBottomMm: 2.2 });
            addList(model.contactLines);
            addWrappedText(model.thanksLine, { marginBottomMm: 7 });
            addSignatureBlock(participant);
        });

        return {
            fileName: filename || "participation-confirmation.pdf",
            save: function(customFilename) {
                doc.save(customFilename || filename || "participation-confirmation.pdf");
            },
            getBlobUrl: function() {
                return doc.output("bloburl");
            },
            getPageCount: function() {
                return doc.internal.getNumberOfPages();
            }
        };
    }

    function renderPdfPreview(model, selector, filename) {
        var pdfHandle = createPdf(model, filename);
        var container = window.document.querySelector(selector);

        if (container) {
            container.innerHTML = "";
            var iframe = window.document.createElement("iframe");
            iframe.className = "preview-pdf-frame";
            iframe.setAttribute("title", "PDF preview");
            iframe.src = pdfHandle.getBlobUrl();
            container.appendChild(iframe);
        }

        return pdfHandle;
    }

    window.ParticipationConfirmationRenderer = {
        createPdf: createPdf,
        renderPdfPreview: renderPdfPreview,
        sanitizeFilename: sanitizeFilename
    };
})(window);
