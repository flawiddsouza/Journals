window.select = (query) => document.querySelector(query)
window.selectAll = (query) => document.querySelectorAll(query)

var hamburger = select('.journal-sidebar-hamburger')
var sidebar = select('.journal-sidebar')

import * as DOMHelpers from './DOMHelpers.js'

hamburger.onclick = () => {
    if(DOMHelpers.shown(sidebar)) {
        DOMHelpers.hide(sidebar)
    } else {
        DOMHelpers.show(sidebar)
    }
}

window.data = {
    journals: [
        {
            id: 1,
            name: 'Journal 1'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        },
        {
            id: 2,
            name: 'Journal 2'
        }
    ]
}

var loopElements = Array.from(document.querySelectorAll('[data-loop]'))

loopElements.forEach(loopElement => {
    let parent = loopElement.parentElement
    let html = ''
    window.data[loopElement.dataset.loop].forEach(item => {
        let loopElementCopy = loopElement.cloneNode(true)
        let variablesInsideLoopElement = loopElement.innerHTML.match(/\{\{(.*?)\}\}/g).map(match => match.replace('{{', '').replace('}}', '').trim())
        variablesInsideLoopElement.forEach(variableInsideLoopElement => {
            let regex = new RegExp(`\{\{(.*?${variableInsideLoopElement}.*?)\}\}`, 'g')
            loopElementCopy.innerHTML = loopElementCopy.innerHTML.replace(regex, item[variableInsideLoopElement])
        })
        parent.appendChild(loopElementCopy)
    })
    parent.insertAdjacentHTML('beforeend', html)
    DOMHelpers.hide(loopElement)
})
