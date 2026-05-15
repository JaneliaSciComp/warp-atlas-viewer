import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import ViewerMenuLink from './ViewerMenuLink.vue';
import './custom.css';

export default {
  ...DefaultTheme,
  Layout,
  async enhanceApp(ctx) {
    await DefaultTheme.enhanceApp?.(ctx);
    ctx.app.component('ViewerMenuLink', ViewerMenuLink);
  },
};
