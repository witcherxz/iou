export const Platform = { OS: 'android' };
export const Alert = {};
export const requireOptionalNativeModule = () => null;
export const storageWrites: { key: string; value: string }[] = [];
export default {
  async getItem(key: string) {
    return localStorage.getItem('store:' + key);
  },
  async setItem(key: string, value: string) {
    storageWrites.push({ key, value });
    localStorage.setItem('store:' + key, value);
  },
};
