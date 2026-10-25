// Entry for optimize.html: a separate, cross-origin isolated page for the FSRS optimizer.
import { mount } from 'svelte';
import Optimize from './routes/Optimize.svelte';
import './app.css';

export default mount(Optimize, { target: document.getElementById('app')! });
