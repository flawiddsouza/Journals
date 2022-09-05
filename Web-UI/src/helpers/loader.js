export function createLoader() {
    const loader = document.createElement('div')

    loader.style.position = 'fixed'
    loader.style.top = 0
    loader.style.height = '100vh'
    loader.style.width = '100vw'
    loader.style.display = 'grid'
    loader.style.placeItems = 'center'
    loader.style.backgroundColor = 'rgb(255 255 255 / 61%)'
    loader.innerHTML = `
        <div style="padding: 1rem; background: white;">
            Uploading...
        </div>
    `

    document.body.appendChild(loader)

    return loader
}
