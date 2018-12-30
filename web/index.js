var PRE_HEADERS  = [ "Namespace", "Repo" ];
var POST_HEADERS = [ "Stars", "Pulls", "Description" ];

document.addEventListener("DOMContentLoaded", function() {
var el_headers   = document.getElementById("results_head");
var el_results   = document.getElementById("results");
var el_query     = document.getElementById("query");
var el_namespace = document.getElementById("namespace");
var el_results_head_cover = document.getElementById("results_head_cover");
var el_results_count = document.getElementById("results_count");
var el_page = document.getElementById("page");
var el_page_count = document.getElementById("page_count");
var el_back = document.getElementById("back");
var el_next = document.getElementById("next");
var el_filters = document.getElementById("filters");
var el_official = document.getElementById("official");
var el_popup = document.getElementById("popup");

var namespace = "";
var query = "";
var page = 0;
var page_count = 0;
var os_filters = "";
var arch_filters = "";

el_results_head_cover.style.width = (function() {
	var o = document.createElement("DIV");
	o.style.visibility = "hidden";
	o.style.width = "100px";
	o.style.msOverflowStyle = "scrollbar";
	
	document.body.appendChild(o);
	
	var w = o.offsetWidth;
	o.style.overflow = "scroll";
	
	var i = document.createElement("div");
	i.style.width = "100%";
	o.appendChild(i);
	
	w -= i.offsetWidth;
	o.parentNode.removeChild(o);

	return w;
})() + "px";
el_headers.style.width = "calc(100% - " + el_results_head_cover.style.width + ")";

function OE(name, value) {
	if (value.trim() === "") {
		return "";
	}
	
	return name + encodeURIComponent(value);
}

function Search() {
	StartLoad();
	
	if (window.stop) {
		window.stop();
	} else {
		document.execCommand("Stop");
	}
	
	el_filters.classList.remove("visible");
	el_results.innerHTML = "";
	el_results_count.innerHTML = "Loading...";
	
	var uri = OE("&q=", query) + OE("&n=", namespace) + OE("&p=", (page-1).toString()) + OE("&arch=", arch_filters) + OE("&os=", os_filters);
	window.history.pushState(null, null, window.location.pathname);
	window.history.replaceState(null, null, uri !== "" ? "?" + uri.slice(1) : "");
	HttpGet("./search?" + uri, function(e) {
		StopLoad();
		
		var resp = JSON.parse(e);
		if (resp && resp.results) {
			el_page.value = page;
			el_page_count.innerHTML = page_count = resp.pages;
			
			el_next.innerHTML = page !== page_count ? ">>" : "";
			el_back.innerHTML = page > 1 ? "<<" : "";
			
			el_results_count.innerHTML = "Results: " + resp.results.length + "/" + resp.count;
			
			var oss   = {};
			var archs = {};
			for (var i = 0; i < resp.results.length; ++i) {
				if (resp.results[i].architectures) {
					for (var r = resp.results[i].architectures, e = 0; e < r.length; ++e) {
						if (r[e].name !== "") archs[r[e].name.toUpperCase()] = 1;
					}
				}
				
				if (resp.results[i].operating_systems) {
					for (var r = resp.results[i].operating_systems, e = 0; e < r.length; ++e) {
						if (r[e].name !== "") oss[r[e].name.toUpperCase()] = 1;
					}
				}
			}
			
			el_headers.innerHTML = "";
			var new_head = "<thead><tr>";
			for (var i = 0; i < PRE_HEADERS.length; ++i) new_head += "<th>" + PRE_HEADERS[i] + "</th>";
			Object.keys(oss).forEach(function(a) { new_head += '<th class="os_td">' + a + "</th>"; });
			Object.keys(archs).forEach(function(a) { new_head += '<th class="arch_td">' + a + "</th>"; });
			for (var i = 0; i < POST_HEADERS.length; ++i) new_head += "<th>" + POST_HEADERS[i] + "</th>";
			new_head += "</thead></tr>";
			el_headers.innerHTML = new_head;

			var out = "";
			for (var i = 0; i < resp.results.length; ++i) {
				var r = resp.results[i];
				var name = r.name.split("/")[1];
				if (name === undefined) name = r.name;
				var namespace = r.publisher.name.toLowerCase() === "docker" ? "library" : Escape(r.publisher.name);
				out += '<tr><td><div class="twisty no_select" title="Show tags">+</div><a href="./?n=' + namespace + '" title="' + namespace + '">' + namespace + 
					   '</a></td><td title="' + name + '"><a href="https://hub.docker.com/r/' + namespace + '/' + name + '">' + Escape(name) + "</a></td>";
				
				Object.keys(oss).forEach(function(os) {
					var has = false;
					if (r.operating_systems) {
						for (var e = 0; e < r.operating_systems.length; ++e) {
							if (r.operating_systems[e].name.toUpperCase() === os) {
								has = true;
								break;
							}
						}
					}
					
					if (has) {
						out += '<td class="y os_td">y</td>';
					} else {
						out += '<td class="n os_td">n</td>';
					}
				});

				Object.keys(archs).forEach(function(arch) {
					var has = false;
					if (r.architectures) {
						for (var e = 0; e < r.architectures.length; ++e) {
							if (r.architectures[e].name.toUpperCase() === arch) {
								has = true;
								break;
							}
						}
					}
					
					if (has) {
						out += '<td class="y arch_td">y</td>';
					} else {
						out += '<td class="n arch_td">n</td>';
					}
				});
				
				var desc = Escape(r.short_description);
				out += "<td>" + r.star_count + "</td><td>" + r.pull_count + '</td><td>' + desc + "</td></tr>";
			}
			
			el_results.innerHTML = out;
			
			for (var e = document.getElementsByClassName("twisty"), i = 0; i < e.length; ++i) {
				e[i].onclick = function() {
					var twisty = this;
					
					if (twisty.innerText === "+") {
						if (twisty.requested) {
							if (twisty.done) {
								var row = twisty.parentNode.parentNode;
								for (var i = 0; i <= Object.keys(oss).length + Object.keys(archs).length; ++i) {
									var td = row.children[1 + i];
									td.children[td.children.length - 1].style.display = "";
								}
							
								twisty.innerText = "–";
							}
						} else {
							twisty.requested = true;
							StartLoad();
							HttpGet("./tags?i=" + encodeURIComponent((twisty.parentNode.innerText.slice(1) + "/" + twisty.parentNode.parentNode.children[1].innerText).trim()), function(e) {		
								StopLoad();
								twisty.innerText = "–";
								
								var row = twisty.parentNode.parentNode;
								var tags = JSON.parse(e);
								if (tags && tags.length > 0) {
									tags.sort(function(a, b) {
										a = Date.parse(a.last_updated);
										b = Date.parse(b.last_updated);
										if (isNaN(a)) a = 0;
										if (isNaN(b)) b = 0;
										return b - a;
									});
										
									var s = "<div>"
									for (var i = 0; i < tags.length; ++i) {
										s += '<div class="' + (i % 2 === 0 ? "tag_row_even" : "") + '" title="' + tags[i].name + '">' + tags[i].name + "</div>";
									}
									row.children[1].innerHTML += s + "</div>";

									Object.keys(oss).forEach(function(os, i) {
										os = os.toLowerCase();
										var add = "<div>"
										for (var e = 0; e < tags.length; ++e) {
											add += '<div class="' + (e % 2 === 0 ? "tag_row_even" : "") + '"><div class="';
											var y = false;
											for (var r = 0; r < tags[e].images.length; ++r) {
												if (tags[e].images[r].os && tags[e].images[r].os.toLowerCase() === os) {
													y = true;
													break;
												}
											}
											add += y ? 'y">y' : 'n">n';
											add += "</div></div>";
										}
										row.children[2 + i].innerHTML += add + "</div>";
									});

									Object.keys(archs).forEach(function(arch, i) {
										arch = arch.toLowerCase();
										var add = "<div>"
										for (var e = 0; e < tags.length; ++e) {
											add += '<div class="' + (e % 2 === 0 ? "tag_row_even" : "") + '"><div class="';
											var y = false;
											for (var r = 0; r < tags[e].images.length; ++r) {
												if (tags[e].images[r].architecture && tags[e].images[r].architecture.toLowerCase() === arch) {
													y = true;
													break;
												}
											}
											add += y ? 'y">y' : 'n">n';
											add += "</div></div>";
										}
										row.children[2 + Object.keys(oss).length + i].innerHTML += add + "</div>";
									});
								} else {
									twisty.parentNode.removeChild(twisty);
								}
								
								
								for (var e = document.querySelectorAll("tr td .y"), i = 0; i < e.length; ++i) {
									e[i].onclick = function() {
										var node = this.parentNode;
										var index = node.parentNode.children.length - Array.prototype.indexOf.call(node.parentNode.children, node);
										var row = node.parentNode.parentNode.parentNode;
										var img = row.children[0].innerText.replace("–", "").replace("+", "").trim();
										var div = row.children[1];
										img += "/" + div.innerText.split("\n")[0].trim();
										div = div.children[div.children.length - 1];
										div = div.children[div.children.length - index];
										if (!div.done) {
											div.done = true;
											var tag = div.innerText.trim();
											
											StartLoad();
											HttpGet("./manifest?i=" + encodeURIComponent(img) + "&t=" + encodeURIComponent(tag), function(e) {
												StopLoad();
												
												e = JSON.parse(e);
												if (e && e.manifests) {
													e = e.manifests;
													var variants = {};
													var versions = {};
													for (var i = 0; i < e.length; ++i) {
														var p = e[i].platform;
														if (p) {
															if (p.architecture && p.variant) {
																if (variants[p.architecture]) {
																	variants[p.architecture] += "\n" + p.variant;
																} else {
																	variants[p.architecture] = p.variant;
																}
															}
															
															if (p.os && p["os.version"]) {
																if (versions[p.os]) {
																	versions[p.os] += "\n" + p["os.version"];
																} else {
																	versions[p.os] = p["os.version"];
																}
															}
														}
													}
													
													Object.keys(variants).forEach(function(a) {
														var col = -1;
														Object.keys(archs).forEach(function(arch, i) {
															if (arch.toLowerCase() === a.toLowerCase()) {
																col = 2 + Object.keys(oss).length + i;
															}
														});
														
														if (col !== -1) {
															var e = row.children[col];
															e = e.children[e.children.length - 1];
															e.children[e.children.length - index].info = variants[a]; 
														}
													});
													
													Object.keys(versions).forEach(function(a) {
														var col = -1;
														Object.keys(oss).forEach(function(os, i) {
															if (os.toLowerCase() === a.toLowerCase()) {
																col = 2 + i;
															}
														});
														
														if (col !== -1) {
															var e = row.children[col];
															e = e.children[e.children.length - 1];
															e.children[e.children.length - index].info = versions[a]; 
														}
													});
													
													AddPopup(node, node.info);
												}
											});
										} else {
											AddPopup(node, node.info);
										}
									};
								}
								
								twisty.done = true;
							});
						}
					} else if (twisty.innerText === "–") {
						var row = twisty.parentNode.parentNode;
						for (var i = 0; i <= Object.keys(oss).length + Object.keys(archs).length; ++i) {
							var td = row.children[1 + i];
							td.children[td.children.length - 1].style.display = "none";
						}
											
						twisty.innerText = "+";
					}
				};
			}
		} else {
			el_page.value = el_page_count.innerHTML = "0";
			el_next.innerHTML = el_back.innerHTML = "";
			el_results_count.innerHTML = "Results: 0";
		}
		
		for (var e = document.querySelectorAll("tr td:last-child"), i = 0; i < e.length; ++i) {
			e[i].onclick = function() {
				AddPopup(this, this.innerText);
			};
		}
		
		for (var e = document.getElementsByTagName("th"), i = 0; i < e.length; ++i) {
			(function(index, length) {
				e[i].onclick = function() {
					var sign = 1;
					if (this.innerHTML.indexOf("arrow_up") !== -1) sign = -1;
					
					for (var e = document.getElementsByClassName("arrow_up"), i = 0; i < e.length; ++i) e[i].parentNode.removeChild(e[i]);
					for (var e = document.getElementsByClassName("arrow_down"), i = 0; i < e.length; ++i) e[i].parentNode.removeChild(e[i]);
					
					this.innerHTML += '<div class="' + (sign === 1 ? "arrow_up" : "arrow_down") + '"></div>';
					
					var c = Array.prototype.slice.call(el_results.tBodies[0].children);
					if (index === length - 3 || index === length - 2) {
						c.sort(function(a, b) {
							var c = a.children[index].innerText;
							var d = b.children[index].innerText;
							c = parseFloat(c) * (c.indexOf("K") !== -1 ? 1000 : c.indexOf("M") !== -1 ? 1000000 : 1);
							d = parseFloat(d) * (d.indexOf("K") !== -1 ? 1000 : d.indexOf("M") !== -1 ? 1000000 : 1);

							if ((r = sign * (d - c)) === 0) {
								r = a.children[1].innerText.localeCompare(b.children[1].innerText);
							}
							
							return r;
						});
					} else {
						c.sort(function(a, b) {
							var r = sign * a.children[index].innerText.localeCompare(b.children[index].innerText);
							if (r === 0) {
								r = a.children[1].innerText.localeCompare(b.children[1].innerText);
							}
							
							return r;
						});
					}
					
					
					el_results.tBodies[0].innerHTML = "";
					for (var i = 0; i < c.length; ++i) el_results.tBodies[0].appendChild(c[i]);
					
				};
			})(i, e.length);
		}
	});
}

function Escape(e) {
	return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function AddPopup(elem, text) {
	if (!text || text.trim() === "") return;
	
	popup.innerText = text;
	
	var rect = elem.getBoundingClientRect();
	popup.style.top = (rect.top - 5) + "px";
	popup.style.right = "";
	popup.style.left = Math.round(rect.left + (rect.right - rect.left) / 3) + "px";
	popup.style.display = "initial";
	
	if (popup.getBoundingClientRect().right > el_results.getBoundingClientRect().right) {
		popup.style.left = "";
		popup.style.right = (window.innerWidth - el_results.getBoundingClientRect().right) + "px";
	}
	
	popup.onmouseleave = function() {
		popup.style.display = "none";
	};
}

function StartLoad() {
	document.body.classList.add("wait");
}

function StopLoad() {
	document.body.classList.remove("wait");
}

function HttpGet(url, callback) {
	var x = new XMLHttpRequest();
	x.onreadystatechange = function() {
		if (x.readyState === 4 && x.status === 200) {
			callback(x.responseText);
		}
	};
	x.open("GET", url, true);
	x.send(null);
}

function SearchEvent() {
	namespace = el_namespace.value.trim();
	query = el_query.value.trim();
	page = 1;
	
	os_filters = arch_filters = "";
	for (var e = document.getElementsByClassName("filter"), i = 0; i < e.length; ++i) {
		if (e[i].checked) {
			var s = e[i].value.split(":");
			switch (s[0]) {
				case "os":
					os_filters += (os_filters !== "" ? "," : "") + s[1];
					break;
				case "arch":
					arch_filters += (arch_filters !== "" ? "," : "") + s[1];
					break;
			}
		}
	}
	
	Search();
}

document.getElementById("search").onclick = SearchEvent;
el_query.onkeydown = el_namespace.onkeydown = function(e) {
	if (e.keyCode === 13) {
		SearchEvent();
	}
};

el_page.onblur = function() {
	var p = parseInt(el_page.value);
	
	if (p < 1 || isNaN(p)) p = 1;
	if (p > page_count) p = page_count;
	el_page.value = p;
	
	if (p !== page) {
		page = p;
		Search();
	}
};

el_page.onkeydown = function(e) {
	if (e.keyCode === 13) {
		el_page.onblur();
	}
}

el_back.onclick = function() {
	if (page > 0) {
		page.value = --page;
		Search();
	}
};

el_next.onclick = function() {
	if (page < page_count) {
		page.value = ++page;
		Search();
	}
};

document.body.onclick = function() {
	el_filters.classList.remove("visible");
};

document.getElementById("filters_button").onclick = function(e) {
	el_filters.classList.toggle("visible");
	e.stopPropagation();
};

document.getElementById("filters_outer").onclick = function(e) { e.stopPropagation(); };

el_official.onclick = function() {
	el_namespace.disabled = !el_namespace.disabled;
	el_namespace.value = el_namespace.disabled ? "library" : "";
};

if (el_official.checked) el_official.onclick();

function GetQueryValue(v) {
	var s = window.location.href;
	var q = s.indexOf("?");
	if (q !== -1) {
		var queries = s.slice(q + 1).split("&");
		for (var i = 0; i < queries.length; ++i) {
			var kv = queries[i].split("=");
			if (kv.length === 2 && kv[0] === v) {
				return decodeURIComponent(kv[1]);
			}
		}
	}
	
	return "";
}

if (window.location.href.indexOf("?") !== -1) {
	el_namespace.value = namespace = GetQueryValue("n");
	el_query.value = query = GetQueryValue("q");
	os_filters = GetQueryValue("os");
	for (var e = os_filters.split(","), i = 0; i < e.length; ++i) {
		for (var o = document.getElementsByClassName("filter"), p = 0; p < o.length; ++p) {
			var s = o[p].value.split(":");
			if (s[0] === "os" && e[i] === s[1]) {
				o[p].checked = true;
				break;
			}
		}
	}
	
	arch_filters = GetQueryValue("arch");
	for (var e = arch_filters.split(","), i = 0; i < e.length; ++i) {
		for (var o = document.getElementsByClassName("filter"), p = 0; p < o.length; ++p) {
			var s = o[p].value.split(":");
			if (s[0] === "arch" && e[i] === s[1]) {
				o[p].checked = true;
				break;
			}
		}
	}
	
	page = parseInt(GetQueryValue("p")) + 1;
	if (isNaN(page)) page = 1;
	Search();
}

}, false);