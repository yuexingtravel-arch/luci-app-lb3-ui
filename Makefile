include $(TOPDIR)/rules.mk

PKG_RELEASE:=2

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Codex

LUCI_TITLE:=LuCI three-line load balancing dashboard
LUCI_PKGNAME:=luci-app-lb3-ui
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-file +jsonfilter +nftables

include $(TOPDIR)/feeds/luci/luci.mk

