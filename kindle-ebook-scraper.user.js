// ==UserScript==
// @name         Amazon Kindle Ebook Scraper
// @namespace    https://github.com/gekkedev/kindle-ebook-scraper
// @updateURL    https://raw.githubusercontent.com/gekkedev/kindle-ebook-scraper/main/kindle-ebook-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/gekkedev/kindle-ebook-scraper/main/kindle-ebook-scraper.user.js
// @version      1.2
// @description  Automatically downloads entire ebooks from the Amazon Kindle Cloud Reader as a PDF, triggered by user action.
// @match        https://lesen.amazon.de/*?asin=*
// @match        https://read.amazon.co.uk/*?asin=*
// @match        https://read.amazon.com/*?asin=*
// @match        https://lire.amazon.fr/*?asin=*
// @match        https://leer.amazon.es/*?asin=*
// @match        https://read.amazon.in/*?asin=*
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// ==/UserScript==

;(function () {
  "use strict"
  const softwareTitle = "Amazon Kindle Ebook Scraper"

  function getImage() {
    return document.querySelector("#kr-renderer img")
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

  function getBookTitle() {
    function sanitizeFilename(name) {
      return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "downloaded_book"
    }

    const candidates = [
      document.querySelector("ion-title"),
      document.querySelector(".top-chrome__book-title"),
      document.querySelector(".title-default")
    ]
    for (const node of candidates) {
      const text = node?.textContent?.trim()
      if (text) {
        return sanitizeFilename(text)
      }
    }
    return sanitizeFilename(document.title || "downloaded_book")
  }

  GM_registerMenuCommand("Start Ebook Scraping", async function () {
    GM_notification("Starting ebook download process...", softwareTitle)

    /** Unified navigation function replacing UI clicks with native keyboard events */
    async function navigate(direction) {
      // 1 for forward, -1 for backward
      // Give the browser a moment to process previous heavy PDF canvas generation
      await delay(200)

      const imgNode = getImage()
      const beforeSrc = imgNode ? imgNode.src : null

      const btnSelector = direction === 1 ? "button#kr-chevron-right" : "button#kr-chevron-left"
      const btn = document.querySelector(btnSelector)

      // If the button is in the DOM and explicitly marked disabled, we hit the start/end bounds
      if (btn && (btn.disabled || btn.getAttribute("aria-disabled") === "true" || btn.style.display === "none")) {
        return false
      }

      // 1. Dispatch Keyboard Events (Primary reliable method - ignores disappearing UI)
      const key = direction === 1 ? "ArrowRight" : "ArrowLeft"
      const keyCode = direction === 1 ? 39 : 37
      const keyEvent = new KeyboardEvent("keydown", {
        key: key,
        code: key,
        keyCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true
      })
      document.dispatchEvent(keyEvent)

      // 2. Dispatch Button Clicks (Fallback if keys are intercepted)
      if (btn) {
        ;["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(type => {
          btn.dispatchEvent(
            new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: unsafeWindow })
          )
        })
      }

      // 3. Dispatch Wheel Event (Final Fallback)
      const wheelEvent = new WheelEvent("wheel", {
        deltaY: direction,
        bubbles: true,
        cancelable: true,
        view: unsafeWindow
      })
      document.body.dispatchEvent(wheelEvent)

      // Poll for the image src to change (Timeout after 8 seconds for slower networks)
      let waitCount = 0
      while (waitCount < 160) {
        await delay(50)
        const currentImg = getImage()
        const currentSrc = currentImg ? currentImg.src : null

        // If the src exists and is explicitly different from before, navigation succeeded
        if (currentSrc && currentSrc !== beforeSrc) {
          return true
        }
        waitCount++
      }

      // If loop finishes without src changing, assume we hit the end bound
      return false
    }

    async function goForward() {
      return navigate(1)
    }
    async function goBackward() {
      return navigate(-1)
    }

    const pdf = new jspdf.jsPDF({ orientation: "landscape" })

    // navigate to the first page
    while (await goBackward()) {
      // Loop until false (reached the beginning)
    }

    await captureImage(true) // capture first page

    // scroll forward and capture images until we reach the end
    while (await goForward()) {
      await captureImage()
    }

    async function captureImage(firstPage = false) {
      // Safely check if image exists, is fully loaded, and has dimensions
      while (!getImage() || !getImage().complete || getImage().naturalWidth === 0) {
        await delay(50)
      }

      await new Promise(resolve => {
        const image = getImage()
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")

        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

        const imgData = canvas.toDataURL("image/jpeg")

        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = pdf.internal.pageSize.getHeight()

        let imgWidth = pdfWidth
        let imgHeight = (canvas.height / canvas.width) * pdfWidth

        if (imgHeight > pdfHeight) {
          imgHeight = pdfHeight
          imgWidth = (canvas.width / canvas.height) * pdfHeight
        }

        if (!firstPage) pdf.addPage()
        const xOffset = (pdfWidth - imgWidth) / 2
        const yOffset = (pdfHeight - imgHeight) / 2

        pdf.addImage(imgData, "JPEG", xOffset, yOffset, imgWidth, imgHeight)
        resolve()
      })
    }

    pdf.save(`${getBookTitle()}.pdf`)
    GM_notification("Ebook download complete!", softwareTitle)
  })
})()
