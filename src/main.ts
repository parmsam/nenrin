import { mount } from 'svelte';
import App from './App.svelte';
import 'katex/dist/katex.min.css';
import './app.css';

export default mount(App, { target: document.getElementById('app')! });
