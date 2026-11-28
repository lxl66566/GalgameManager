/* @refresh reload */
// Entry module: the only module shipped to the browser that may run code at
// import time. Every other module stays pure when imported; `sideEffects` in
// package.json mirrors this.
import 'virtual:uno.css'
import { render } from 'solid-js/web'

import App from './App'

const root = document.querySelector('#root')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
  )
}

render(() => <App />, root!)
